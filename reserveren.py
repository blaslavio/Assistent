"""Samen iets plannen en reserveren: een date, speelafspraak, uitje of etentje.

Zaken in de app (restaurant, kapper, speelparadijs...) nemen gratis reserveringen aan. Een reservering staat meteen
in je agenda (met reistijd en vertrekwekker), je nodigt wie je wilt uit, bij vol kun je op de wachtlijst, en na je
bezoek schrijf je een review. Zaken die (nog) niet in de app zitten, zet je als plan in je agenda met hun site of
telefoonnummer erbij.
"""

from datetime import date, datetime, timedelta

import activiteiten
import opslag
import samen

# Waarvoor je plant: de soort in je agenda, een icoon en welke uitjes erbij passen.
GELEGENHEDEN = {
    "Date": ("uitgaan", "❤️", ["Eten", "Cultuur", "Film", "Muziek", "Actief", "Natuur"]),
    "Speelafspraak": ("familie en vrienden", "🧸", ["Familie", "Dieren", "Natuur", "Actief"]),
    "Uitje": ("uitgaan", "🎉", activiteiten.VOORKEUREN + ["Eten"]),
    "Etentje": ("etentje", "🍽️", ["Eten"]),
    "Verjaardag": ("familie en vrienden", "🎂", ["Eten", "Actief", "Familie"]),
    "Afspraak": ("afspraak", "📌", []),
}
STATUS = {"bevestigd": "Bevestigd", "wachtlijst": "Op de wachtlijst", "geannuleerd": "Geannuleerd",
          "gekomen": "Geweest", "niet_gekomen": "Niet gekomen"}
WEEKDAGEN = ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"]


# --- Als gast ----------------------------------------------------------------------------------------------------

def zaken(zoek: str = "") -> list[dict]:
    """Zaken in de app waar je kunt reserveren."""
    return opslag._rpc_ik("reserveren_zaken", p_zoek=zoek)["zaken"]


def tijden(adres: str, dag: date, personen: int = 2) -> list[dict]:
    """Aanvangstijden op een dag, elk met vrij True/False."""
    return samen._ok(opslag._rpc_ik("reserveren_tijden", p_adres=adres, p_datum=dag.isoformat(),
                                    p_personen=personen))["tijden"]


def _in_agenda(r: dict, gelegenheid: str, personen: int) -> dict:
    start = datetime.fromisoformat(r["start"]).astimezone()
    einde = start + timedelta(minutes=r["minuten"])
    soort = GELEGENHEDEN.get(gelegenheid, GELEGENHEDEN["Afspraak"])[0]
    titel = f"{gelegenheid}: {r['zaak']}" if gelegenheid and gelegenheid != "Afspraak" else r["zaak"]
    notitie = f"Gereserveerd via de app, {personen} {'persoon' if personen == 1 else 'personen'}."
    if r.get("bericht"):
        notitie += f"\nVan de zaak: {r['bericht']}"
    a = opslag.afspraak_toevoegen(titel, start.strftime("%Y-%m-%dT%H:%M"), einde.strftime("%Y-%m-%dT%H:%M"),
                                  notitie, r.get("winkeladres", ""), soort=soort)
    opslag.afspraak_bijwerken(a["id"], reservering=r["id"])
    return a


def reserveren(adres: str, start: str, personen: int = 2, opmerking: str = "", gelegenheid: str = "",
               wachtlijst: bool = False, uitnodigen: list[str] | None = None) -> dict:
    """Reserveert, zet het in je agenda en nodigt mensen uit. Bij vol en wachtlijst: alleen op de wachtlijst."""
    r = samen._ok(opslag._rpc_ik("reserveren", p_adres=adres, p_start=start, p_personen=personen,
                                 p_opmerking=opmerking, p_gelegenheid=gelegenheid, p_wachtlijst=wachtlijst))
    r["niet_uitgenodigd"] = []
    if r["status"] == "bevestigd":
        afspraak = _in_agenda(r, gelegenheid, r["personen"])
        r["afspraak_id"] = afspraak["id"]
        for naam in uitnodigen or []:
            try:
                samen.uitnodigen(afspraak["id"], naam)
            except samen.Fout:
                r["niet_uitgenodigd"].append(naam)
    return r


def mijn() -> list[dict]:
    """Je reserveringen (ook van de afgelopen 60 dagen, voor reviews). Houdt je agenda gelijk."""
    lijst = opslag._rpc_ik("mijn_reserveringen")["reserveringen"]
    _agenda_gelijk(lijst)
    return lijst


def _agenda_gelijk(lijst: list[dict]) -> None:
    """Haalt afspraken weg van reserveringen die de zaak heeft geannuleerd."""
    weg = {r["id"] for r in lijst if r["status"] == "geannuleerd"}
    if not weg:
        return
    for a in opslag.laden()["afspraken"]:
        if a.get("reservering") in weg:
            opslag.afspraak_verwijderen(a["id"])


def annuleren(reservering_id: int) -> bool:
    gelukt = bool(opslag._rpc_ik("reservering_annuleren", p_id=reservering_id))
    if gelukt:
        for a in opslag.laden()["afspraken"]:
            if a.get("reservering") == reservering_id:
                opslag.afspraak_verwijderen(a["id"])
    return gelukt


def wachtlijst_bevestigen(r: dict) -> None:
    """Er is plek: van de wachtlijst naar een vaste reservering, en in je agenda."""
    samen._ok(opslag._rpc_ik("wachtlijst_bevestigen", p_id=r["id"]))
    _in_agenda(r, r.get("gelegenheid", ""), r["personen"])


def beoordelen(reservering_id: int, sterren: int, tekst: str = "") -> None:
    samen._ok(opslag._rpc_ik("reservering_beoordelen", p_id=reservering_id, p_sterren=sterren, p_tekst=tekst))


# --- Ideeën, ook buiten de app ------------------------------------------------------------------------------------

def ideeen(gelegenheid: str, adres: str = "") -> list[dict]:
    """Plekken in de buurt die passen bij de gelegenheid: eten en drinken plus uitjes, dichtstbij eerst."""
    passend = set(GELEGENHEDEN.get(gelegenheid, GELEGENHEDEN["Uitje"])[2])
    lijst = []
    if "Eten" in passend or "Familie" in passend:
        lijst += activiteiten.eten_en_spelen(adres)
    lijst += activiteiten.in_de_buurt(adres)
    gezien, uit = set(), []
    for a in sorted(lijst, key=lambda a: a["afstand_km"]):
        if a["naam"] in gezien or (passend and a["voorkeur"] not in passend):
            continue
        gezien.add(a["naam"])
        uit.append(a)
    return uit


def als_plan(plek: dict, start: str, minuten: int, gelegenheid: str, uitnodigen: list[str] | None = None) -> dict:
    """Een plek buiten de app als plan in je agenda, met een taak om te reserveren als dat nodig is."""
    soort = GELEGENHEDEN.get(gelegenheid, GELEGENHEDEN["Afspraak"])[0]
    begin = datetime.fromisoformat(start)
    notitie = "\n".join(filter(None, [plek.get("soort", ""), plek.get("website", ""), plek.get("telefoon", "")]))
    a = opslag.afspraak_toevoegen(f"{gelegenheid}: {plek['naam']}" if gelegenheid else plek["naam"],
                                  begin.strftime("%Y-%m-%dT%H:%M"),
                                  (begin + timedelta(minutes=minuten)).strftime("%Y-%m-%dT%H:%M"), notitie,
                                  plek.get("adres") or plek["naam"], soort=soort)
    niet = []
    for naam in uitnodigen or []:
        try:
            samen.uitnodigen(a["id"], naam)
        except samen.Fout:
            niet.append(naam)
    if plek.get("reserveren"):
        opslag.taak_toevoegen(f"Reserveren bij {plek['naam']}", deadline=begin.date().isoformat(),
                              notitie=plek.get("telefoon") or plek.get("website") or "")
    return {"afspraak": a, "niet_uitgenodigd": niet}


# --- Aanvragen bij plekken buiten de app -------------------------------------------------------------------------
# De gast vraagt aan via zijn eigen mail (of belt, of de website). In de mail staat een link waarmee het restaurant
# zonder account bevestigt, een ander moment voorstelt of afzegt. De agenda loopt mee.

AANVRAAG_STATUS = {"aangevraagd": "Wacht op antwoord", "bevestigd": "Bevestigd", "afgewezen": "Kan niet",
                   "voorstel": "Ander tijdstip voorgesteld", "geannuleerd": "Geannuleerd"}
_WACHT = " (aangevraagd)"


def aanvraag_maken(plek: dict, start: str, personen: int = 2, opmerking: str = "", gelegenheid: str = "",
                   kanaal: str = "mail", minuten: int = 120) -> dict:
    """Maakt de aanvraag en zet hem (als aangevraagd) in je agenda. Geeft ook de code voor de link terug."""
    begin = datetime.fromisoformat(start).astimezone()
    a = samen._ok(opslag._rpc_ik("aanvraag_maken", p_plek={k: plek.get(k, "") for k in
                                                           ("naam", "adres", "email", "telefoon", "website")},
                                 p_start=begin.isoformat(), p_minuten=minuten, p_personen=personen,
                                 p_opmerking=opmerking, p_gelegenheid=gelegenheid, p_kanaal=kanaal))
    soort = GELEGENHEDEN.get(gelegenheid, GELEGENHEDEN["Afspraak"])[0]
    titel = (f"{gelegenheid}: {plek['naam']}" if gelegenheid and gelegenheid != "Afspraak" else plek["naam"]) + _WACHT
    notitie = "\n".join(filter(None, [f"Reservering aangevraagd, {personen} {'persoon' if personen == 1 else 'personen'}.",
                                      opmerking, plek.get("telefoon", ""), plek.get("website", "")]))
    afspraak = opslag.afspraak_toevoegen(titel, begin.strftime("%Y-%m-%dT%H:%M"),
                                         (begin + timedelta(minutes=minuten)).strftime("%Y-%m-%dT%H:%M"), notitie,
                                         plek.get("adres") or plek["naam"], soort=soort)
    opslag.afspraak_bijwerken(afspraak["id"], aanvraag=a["id"])
    return a | {"afspraak_id": afspraak["id"]}


def aanvraag_link(basis: str, code: str) -> str:
    return f"{basis.rstrip('/')}/?aanvraag={code}"


def aanvraag_mail(plek: dict, start: str, personen: int, opmerking: str, gast: str, link: str) -> tuple[str, str]:
    """Onderwerp en tekst voor de mail aan het restaurant."""
    t = datetime.fromisoformat(start).astimezone()
    dag = f"{WEEKDAGEN[t.weekday()]} {t.day}-{t.month}-{t.year}"
    onderwerp = f"Reserveringsaanvraag {dag} om {t:%H:%M}, {personen} {'persoon' if personen == 1 else 'personen'}"
    tekst = (f"Goedendag,\n\nGraag reserveer ik bij {plek['naam']} voor {personen} "
             f"{'persoon' if personen == 1 else 'personen'} op {dag} om {t:%H:%M}."
             + (f"\n\nOpmerking: {opmerking}" if opmerking else "")
             + f"\n\nWilt u dit bevestigen of een ander tijdstip voorstellen? Dat kan met één klik, zonder account:"
               f"\n{link}\n\nAntwoorden op deze mail mag natuurlijk ook.\n\nMet vriendelijke groet,\n{gast}"
               "\n\n--\nVerstuurd met de app Mijn assistent. Liever geen aanvragen via de app? "
               "Dat kunt u via dezelfde link aangeven.")
    return onderwerp, tekst


def aanvraag_versturen(aanvraag: dict, plek: dict, start: str, personen: int, opmerking: str, link: str) -> None:
    """Verstuurt de aanvraag vanuit de eigen gekoppelde mailbox van de gebruiker."""
    import mail
    onderwerp, tekst = aanvraag_mail(plek, start, personen, opmerking, aanvraag["gast"], link)
    mail.versturen(plek["email"], onderwerp, tekst)


def mijn_aanvragen() -> list[dict]:
    """Je aanvragen; houdt de agenda gelijk met de antwoorden van restaurants."""
    lijst = opslag._rpc_ik("mijn_aanvragen")["aanvragen"]
    per_id = {a["id"]: a for a in lijst}
    for afspraak in list(opslag.laden()["afspraken"]):
        a = per_id.get(afspraak.get("aanvraag"))
        if not a:
            continue
        if a["status"] in ("afgewezen", "geannuleerd"):
            opslag.afspraak_verwijderen(afspraak["id"])
        elif a["status"] == "bevestigd":
            start = datetime.fromisoformat(a["start"]).astimezone()
            nieuw = {"titel": afspraak["titel"].replace(_WACHT, ""), "start": start.strftime("%Y-%m-%dT%H:%M"),
                     "einde": (start + timedelta(minutes=a["minuten"])).strftime("%Y-%m-%dT%H:%M")}
            if any(afspraak.get(k) != v for k, v in nieuw.items()):
                opslag.afspraak_bijwerken(afspraak["id"], **nieuw)
    return lijst


def aanvraag_bijwerken(aanvraag_id: int, status: str) -> dict:
    """status: bevestigd (zelf geregeld), geannuleerd, of voorstel_aannemen."""
    a = samen._ok(opslag._rpc_ik("aanvraag_bijwerken", p_id=aanvraag_id, p_status=status))["aanvraag"]
    mijn_aanvragen()
    return a


# Voor het restaurant (zonder account), via de code in de link.

def aanvraag_bekijken(code: str) -> dict:
    return samen._ok(opslag._rpc("aanvraag_bekijken", p_code=code))


def aanvraag_beantwoorden(code: str, antwoord: str, voorstel: str | None = None, tekst: str = "") -> None:
    samen._ok(opslag._rpc("aanvraag_beantwoorden", p_code=code, p_antwoord=antwoord, p_voorstel=voorstel,
                          p_tekst=tekst))


def aanvraag_interesse(code: str) -> None:
    samen._ok(opslag._rpc("aanvraag_interesse", p_code=code))


def aanvraag_stoppen(code: str, reden: str = "") -> None:
    samen._ok(opslag._rpc("aanvraag_stoppen", p_code=code, p_reden=reden))


def aanvraag_melden(code: str, reden: str) -> None:
    samen._ok(opslag._rpc("aanvraag_melden", p_code=code, p_reden=reden))


# Voor de beheerder.

def beheer_aanvragen() -> dict:
    return opslag._rpc_ik("beheer_aanvragen")


def beheer_aanvraag_afhandelen(aanvraag_id: int, gast_blokkeren: bool = False) -> None:
    opslag._rpc_ik("beheer_aanvraag_afhandelen", p_id=aanvraag_id, p_gast_blokkeren=gast_blokkeren)


# --- Als zaak ------------------------------------------------------------------------------------------------------

STANDAARD = {"aan": False, "soort": "tafel", "uren": {str(d): [["17:00", "21:00"]] for d in (3, 4, 5, 6, 7)},
             "stap": 30, "duur": 120, "capaciteit": 20, "max_groep": 8, "vooruit": 60, "min_vooraf": 60,
             "annuleren_uren": 24, "gesloten": [], "bericht": ""}


def mijn_zaak(van: date, tot: date) -> dict:
    z = opslag._rpc_ik("reserveren_mijn_zaak", p_van=van.isoformat(), p_tot=tot.isoformat())
    z["instellingen"] = STANDAARD | (z.get("instellingen") or {})
    return z


def instellen(instellingen: dict) -> None:
    samen._ok(opslag._rpc_ik("reserveren_instellen", p_instellingen=instellingen))


def status_zetten(reservering_id: int, status: str) -> bool:
    return bool(opslag._rpc_ik("reservering_status", p_id=reservering_id, p_status=status))
