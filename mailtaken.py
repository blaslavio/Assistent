"""Je mail nakijken op taken, afspraken en facturen, ook als je zelf niet in je mail kijkt.

Zolang de app open is, kijkt de assistent hooguit elke twee uur op de achtergrond je nieuwe mail na (en meteen als
je erom vraagt). Spam, phishing, reclame en nieuwsbrieven tellen niet mee. Wat hij vindt, wordt een voorstel op
Vandaag, bij Taken en bij Budget: jij vinkt aan wat in je agenda, op je takenlijst of bij je facturen komt.
Er komt niets bij zonder jouw akkoord.

Het voorstel staat in het geheugen van de server (per account); pas als je iets kiest, worden de nagekeken mails
onthouden (opslag.mail_gezien), zodat dezelfde mail niet nog eens wordt voorgesteld.
"""

import contextvars
import hashlib
import re
import threading
import time
from datetime import date, datetime, timedelta

import anthropic

import toegang
import budget
import inplannen
import mail
import opslag
import slim

MAX_MAILS = 25
ELKE_SECONDEN = 2 * 3600
SOORT_WOORDEN = {
    "sport": ["sporten", "sport", "fitness", "gym", "hardlopen", "training", "zwemmen", "yoga", "padel", "tennis"],
    "etentje": ["eten", "etentje", "diner", "lunch", "ontbijt", "borrel", "restaurant"],
    "werk": ["werk", "vergadering", "meeting", "overleg", "sollicitatie", "presentatie", "gesprek", "teams", "zoom"],
    "gezondheid": ["tandarts", "huisarts", "dokter", "fysio", "ziekenhuis", "kapper", "apotheek"],
    "uitgaan": ["feest", "concert", "bioscoop", "festival", "theater", "museum", "voorstelling"],
    "reizen": ["vlucht", "vakantie", "trein", "hotel", "boarding", "check-in"],
}

_wachtend: dict[str, dict] = {}
_slot = threading.Lock()


def _sleutel() -> str:
    return hashlib.sha256(f"{opslag._naam.get()}|{mail.instellingen().get('adres', '')}".encode()).hexdigest()


def aan() -> bool:
    """Of vanzelf nakijken aan staat (standaard aan als je mail gekoppeld is)."""
    return mail.gekoppeld() and opslag.instellingen().get("mail_nakijken", True)


def wachtend() -> dict:
    """Het voorstel dat klaarstaat: {taken, afspraken, uids, mails, bezig, fout, tijd}."""
    with _slot:
        return dict(_wachtend.get(_sleutel(), {}))


def _soort(titel: str) -> str:
    woorden = set(titel.lower().replace(",", " ").split())
    return next((s for s, lijst in SOORT_WOORDEN.items() if woorden & set(lijst)), "afspraak")


def nieuwe_mails(dagen: int = 10, behalve: set[str] | None = None) -> list[dict]:
    """Recente mails die nog niet zijn nagekeken (alleen de kopregels)."""
    grens = (datetime.now() - timedelta(days=dagen)).strftime("%Y-%m-%d")
    overslaan = set(opslag.mail_gezien()) | (behalve or set())
    return [m for m in mail.lijst(60) if m["uid"] not in overslaan and m["datum"][:10] >= grens][:MAX_MAILS]


def voorstellen(client, dagen: int = 10, behalve: set[str] | None = None) -> dict:
    """Leest nieuwe mails en geeft {mails, uids, taken, afspraken, facturen, spam}. Slaat nog niets op."""
    koppen = nieuwe_mails(dagen, behalve)
    if not koppen:
        return {"mails": 0, "uids": [], "taken": [], "afspraken": [], "facturen": [], "spam": 0}
    alle = mail.lezen_veel([m["uid"] for m in koppen])
    mails = [m for m in alle if not m["spam"]]
    for m in mails:
        if m["nieuwsbrief"]:  # zelden iets voor de agenda, maar soms wel een rekening: korter meesturen
            m["tekst"] = m["tekst"][:600]
    vandaag = date.today()
    bestaande_taken = [t["titel"] for t in opslag.open_taken()]
    bestaande_afspraken = [f"{a['titel']} ({a['start']})" for a in
                           opslag.afspraken_tussen(vandaag.isoformat(), (vandaag + timedelta(days=120)).isoformat())]
    gevonden = slim.mail_nakijken(client, mails, vandaag.isoformat(), bestaande_taken, bestaande_afspraken) \
        if mails else {"taken": [], "afspraken": [], "facturen": []}
    per_uid = {m["uid"]: m for m in mails}
    taken = []
    for t in gevonden["taken"]:
        if not (m := per_uid.get(t["uid"])) or not t["titel"].strip():  # alleen echte mails, niets verzonnen
            continue
        t["bron"] = {"soort": "mail", "uid": m["uid"], "van": m["van"], "onderwerp": m["onderwerp"]}
        t["deadline"] = _datum(t["deadline"])
        taken.append(t)
    afspraken = []
    for a in gevonden["afspraken"]:
        if not (m := per_uid.get(a["uid"])) or not a["titel"].strip():
            continue
        if not (dag := _datum(a["datum"])) or dag < vandaag.isoformat():
            continue
        a["datum"] = dag
        a["bron"] = {"soort": "mail", "uid": m["uid"], "van": m["van"], "onderwerp": m["onderwerp"]}
        afspraken.append(a)
    facturen = []
    for f in gevonden.get("facturen", []):
        if not (m := per_uid.get(f["uid"])) or not f["van"].strip() or not f["bedrag"] or f["bedrag"] <= 0:
            continue
        f["vervaldatum"] = _datum(f["vervaldatum"])
        # Alleen een link die echt in de mail staat; nooit een verzonnen of aangepaste.
        f["betaallink"] = f.get("betaallink", "") if f.get("betaallink") in m.get("betaallinks", []) else ""
        iban = re.sub(r"\s", "", f.get("iban", "")).upper()
        f["iban"] = iban if re.fullmatch(r"[A-Z]{2}\d{2}[A-Z0-9]{10,30}", iban) else ""
        f["kenmerk"] = f.get("kenmerk", "").strip()[:40]
        f["bron"] = {"soort": "mail", "uid": m["uid"], "van": m["van"], "onderwerp": m["onderwerp"]}
        facturen.append(f)
    return {"mails": len(alle), "uids": [m["uid"] for m in alle], "taken": taken, "afspraken": afspraken,
            "facturen": facturen, "spam": len(alle) - len(mails)}


def _datum(tekst: str) -> str:
    try:
        return date.fromisoformat((tekst or "").strip()).isoformat()
    except ValueError:
        return ""


def _tijd(tekst: str) -> str:
    try:
        return datetime.strptime((tekst or "").strip(), "%H:%M").strftime("%H:%M")
    except ValueError:
        return ""


def _samenvoegen(sleutel: str, nieuw: dict) -> None:
    with _slot:
        oud = _wachtend.get(sleutel, {})
        _wachtend[sleutel] = {
            "taken": oud.get("taken", []) + nieuw["taken"], "afspraken": oud.get("afspraken", []) + nieuw["afspraken"],
            "facturen": oud.get("facturen", []) + nieuw.get("facturen", []),
            "uids": list(dict.fromkeys(oud.get("uids", []) + nieuw["uids"])),
            "mails": oud.get("mails", 0) + nieuw["mails"], "spam": oud.get("spam", 0) + nieuw.get("spam", 0),
            "tijd": time.time(), "bezig": False, "fout": None, "gezien": False}


def nu_nakijken(client) -> dict:
    """Meteen nakijken (de gebruiker vraagt erom). Nieuwe vondsten komen bij het voorstel dat al klaarstond."""
    sleutel = _sleutel()
    nieuw = voorstellen(client, behalve=set(wachtend().get("uids", [])))
    _samenvoegen(sleutel, nieuw)
    return wachtend()


def achtergrond(api_sleutel: str) -> None:
    """Start op de achtergrond een controle als de vorige langer dan twee uur geleden is. Wacht nergens op."""
    if not api_sleutel or not aan():
        return
    sleutel = _sleutel()
    with _slot:
        stand = _wachtend.get(sleutel, {})
        if stand.get("bezig") or time.time() - stand.get("tijd", 0) < ELKE_SECONDEN:
            return
        _wachtend[sleutel] = {**stand, "bezig": True}
        behalve = set(stand.get("uids", []))

    def werk() -> None:
        try:
            nieuw = voorstellen(toegang.claude(api_sleutel), behalve=behalve)
            _samenvoegen(sleutel, nieuw)
        except Exception as fout:
            with _slot:
                # Bij een fout (geen tegoed, mail even weg) over een half uur opnieuw, niet meteen.
                _wachtend[sleutel] = {**_wachtend.get(sleutel, {}), "bezig": False, "fout": type(fout).__name__,
                                      "tijd": time.time() - ELKE_SECONDEN + 1800}

    # Het account van deze gebruiker meegeven aan de achtergrondtaak.
    threading.Thread(target=contextvars.copy_context().run, args=(werk,), daemon=True).start()


def verwerken(taken: list[dict], afspraken: list[dict], inplannen_ook: bool = True,
              facturen: list[dict] | None = None, betaalherinnering: bool = True) -> dict:
    """Zet de gekozen taken, afspraken en facturen erin, onthoudt de nagekeken mails en leegt het voorstel.

    Bij een factuur die je zelf moet betalen (geen incasso) komt er met betaalherinnering=True een taak bij.
    """
    stand = wachtend()
    taken = list(taken)
    for f in facturen or []:
        budget.factuur_toevoegen(f["van"], f["bedrag"], f.get("vervaldatum") or None, f.get("omschrijving", ""),
                                 f.get("soort", "uitgave"), f.get("automatisch", False), f.get("categorie", ""),
                                 f.get("bron"), iban=f.get("iban", ""), kenmerk=f.get("kenmerk", ""),
                                 betaallink=f.get("betaallink", ""))
        if betaalherinnering and f.get("soort", "uitgave") == "uitgave" and not f.get("automatisch"):
            taken.append({"titel": f"{f['van']} betalen (€{budget.euro(f['bedrag'])})",
                          "deadline": f.get("vervaldatum") or "", "minuten": 5, "prioriteit": "hoog",
                          "waarom": f.get("omschrijving") or f.get("waarom", ""), "bron": f.get("bron")})
    nieuw = [opslag.taak_toevoegen(t["titel"].strip(), t["deadline"] or None, t.get("minuten") or None,
                                   t.get("prioriteit", ""), t.get("waarom", ""), t.get("bron")) for t in taken]
    gezet = 0
    for a in afspraken:
        begin, einde = _tijd(a.get("begin", "")), _tijd(a.get("einde", ""))
        start = f"{a['datum']}T{begin}" if begin else a["datum"]
        if begin and not einde:
            einde = (datetime.fromisoformat(start) + timedelta(hours=1)).strftime("%H:%M")
        eind = f"{a['datum']}T{einde}" if begin and einde > begin else None
        bron = a.get("bron") or {}
        notitie = f"Uit je mail van {bron.get('van', '')}: {a.get('waarom', '')}".strip()
        opslag.afspraak_toevoegen(a["titel"].strip(), start, eind, notitie=notitie, locatie=a.get("locatie", ""),
                                  soort=_soort(a["titel"]))
        gezet += 1
    opslag.mail_gezien_bewaren(stand.get("uids", []))
    blokken = 0
    if inplannen_ook and nieuw:
        ids = {t["id"] for t in nieuw}
        blokken = inplannen.vastleggen([r for r in inplannen.voorstel(14) if r["taak_id"] in ids])
    with _slot:
        _wachtend[_sleutel()] = {"tijd": stand.get("tijd", time.time()), "bezig": False}
    return {"taken": len(nieuw), "afspraken": gezet, "facturen": len(facturen or []), "blokken": blokken}

