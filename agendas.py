"""Je bestaande agenda's in de app: Apple (iCloud), en via een agendalink ook Google, Outlook en andere.

De app leest je afspraken en zet ze naast de afspraken die je in de app maakt, zodat de assistent rond je echte
agenda plant, reistijden uitrekent en op tijd waarschuwt. Bij Apple kan het ook andersom (als je dat aanzet): je
afspraken uit de app komen in een agenda naar keuze, en afspraken uit Apple wijzig of verwijder je ook in de app.
- Apple: met je Apple ID en een app-specifiek wachtwoord (hetzelfde soort wachtwoord als voor je mail).
- Google, Outlook en andere: met de geheime agendalink (iCal/ICS) die je in die agenda opvraagt.
Afspraken worden een paar minuten onthouden, zodat de app niet bij elke klik opnieuw hoeft te vragen.
"""

import hashlib
import ipaddress
import socket
from urllib.parse import urlsplit
import re
import secrets
import threading
import time
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import httpx

import opslag

ICLOUD = "https://caldav.icloud.com"
NL = ZoneInfo("Europe/Amsterdam")
ONTHOUD_SECONDEN = 300
VENSTER_TERUG, VENSTER_VOORUIT = 60, 400  # dagen die we ophalen: twee maanden terug, ruim een jaar vooruit
KLEUREN = ["#0ea5e9", "#f59e0b", "#10b981", "#8b5cf6", "#ef4444", "#64748b"]

SOORT_WOORDEN = {
    "sport": ["sporten", "sport", "fitness", "gym", "hardlopen", "voetbal", "zwemmen", "yoga", "tennis", "padel",
              "training", "wandelen"],
    "etentje": ["eten", "etentje", "diner", "lunch", "ontbijt", "borrel", "restaurant"],
    "werk": ["werk", "vergadering", "meeting", "overleg", "sollicitatie", "presentatie", "call", "teams", "zoom"],
    "gezondheid": ["tandarts", "huisarts", "dokter", "fysio", "ziekenhuis", "kapper", "apotheek"],
    "uitgaan": ["feest", "concert", "bioscoop", "festival", "theater", "museum"],
    "familie en vrienden": ["verjaardag", "jarig", "familie", "oma", "opa", "mama", "papa"],
    "reizen": ["vlucht", "vakantie", "trein", "hotel"],
}

_cache: dict[str, tuple[float, list[dict], str | None]] = {}
_slot = threading.Lock()
_bezig: dict[str, threading.Thread] = {}


class Fout(Exception):
    """Koppelen lukte niet; de tekst is geschikt om aan de gebruiker te tonen."""


def gekoppeld() -> list[dict]:
    return opslag.instellingen().get("agendas", [])


def _bewaar(lijst: list[dict]) -> None:
    opslag.instellingen_bijwerken(agendas=lijst)  # andere gegevens geven vanzelf een andere geheugensleutel


# --- Koppelen -------------------------------------------------------------------------------------------------------

def koppel_apple(gebruiker: str, wachtwoord: str, url: str = ICLOUD) -> dict:
    """Koppelt je iCloud-agenda's. Geeft de nieuwe koppeling; Fout als inloggen niet lukt."""
    gebruiker, wachtwoord = gebruiker.strip(), re.sub(r"\s", "", wachtwoord)
    if not gebruiker or not wachtwoord:
        raise Fout("Vul je Apple ID en het app-specifieke wachtwoord in.")
    try:
        kalenders = _caldav_agendas(url, gebruiker, wachtwoord)
    except Fout:
        raise
    except Exception:  # netwerk of iCloud zelf
        raise Fout("Kon geen verbinding maken met iCloud. Probeer het straks nog eens.")
    koppeling = {"id": secrets.token_hex(4), "soort": "apple", "naam": "Apple-agenda", "gebruiker": gebruiker,
                 "wachtwoord": wachtwoord, "url": url, "kleur": KLEUREN[len(gekoppeld()) % len(KLEUREN)],
                 "agendas": kalenders, "uit": []}
    _bewaar([a for a in gekoppeld() if not (a["soort"] == "apple" and a.get("gebruiker") == gebruiker)] + [koppeling])
    return koppeling


def koppel_link(naam: str, url: str) -> dict:
    """Koppelt een agenda via een iCal-link (Google, Outlook, of een andere agenda)."""
    url = url.strip().replace("webcal://", "https://", 1)
    if not re.match(r"^https?://\S+$", url):
        raise Fout("Dit lijkt geen agendalink. Hij begint met https:// of webcal://.")
    try:
        tekst = _ophalen_link(url)
        from icalendar import Calendar
        Calendar.from_ical(tekst)
    except Fout:
        raise
    except Exception:
        raise Fout("Op deze link staat geen agenda die de app kan lezen. Kopieer de link in iCal-indeling (.ics).")
    soort = "google" if "google.com" in url else "outlook" if ("outlook" in url or "office365" in url) else "link"
    koppeling = {"id": secrets.token_hex(4), "soort": soort,
                 "naam": naam.strip() or {"google": "Google-agenda", "outlook": "Outlook-agenda"}.get(soort, "Agenda"),
                 "url": url, "kleur": KLEUREN[len(gekoppeld()) % len(KLEUREN)], "uit": []}
    _bewaar(gekoppeld() + [koppeling])
    return koppeling


def ontkoppelen(koppeling_id: str) -> None:
    _bewaar([a for a in gekoppeld() if a["id"] != koppeling_id])


def zichtbaar(koppeling_id: str, agenda: str, aan: bool) -> None:
    """Een losse agenda binnen een koppeling (bijvoorbeeld Werk of Thuis) tonen of verbergen."""
    lijst = gekoppeld()
    for a in lijst:
        if a["id"] == koppeling_id:
            uit = set(a.get("uit", []))
            (uit.discard if aan else uit.add)(agenda)
            a["uit"] = sorted(uit)
    _bewaar(lijst)


# --- Ophalen --------------------------------------------------------------------------------------------------------

def _caldav_agendas(url: str, gebruiker: str, wachtwoord: str) -> list[str]:
    import caldav
    from caldav.lib.error import AuthorizationError

    try:
        with caldav.DAVClient(url=url, username=gebruiker, password=wachtwoord, timeout=12) as client:
            return [k.get_display_name() or "Agenda" for k in client.principal().calendars()]
    except AuthorizationError:
        raise Fout("Apple ID of app-specifiek wachtwoord klopt niet. Gebruik een app-specifiek wachtwoord, "
                   "niet je gewone Apple-wachtwoord.")


def _veilige_agenda_url(url: str) -> None:
    """Blokkeer onveilige hosts voordat een externe kalender wordt opgehaald."""
    try:
        delen = urlsplit(url)
        host = delen.hostname
        if delen.scheme not in ("https", "http") or not host or delen.username or delen.password:
            raise ValueError("ongeldige URL")
        if host.lower() == "localhost" or host.lower().endswith((".localhost", ".local", ".internal")):
            raise ValueError("intern adres")
        adressen = socket.getaddrinfo(host, delen.port or (443 if delen.scheme == "https" else 80),
                                      type=socket.SOCK_STREAM)
        if not adressen or any(not ipaddress.ip_address(item[4][0]).is_global for item in adressen):
            raise ValueError("niet-publiek IP-adres")
    except (ValueError, OSError, UnicodeError):
        raise Fout("Deze agendalink verwijst naar een onveilig of niet-bereikbaar netwerkadres.")


def _ophalen_link(url: str) -> bytes:
    # Handmatige redirects: elke volgende bestemming wordt opnieuw gevalideerd.
    # Een egress-firewall blijft nodig tegen DNS-rebinding tussen validatie en verbinding.
    try:
        with httpx.Client(timeout=12, follow_redirects=False,
                          headers={"User-Agent": "MijnAssistent/1.0"}) as client:
            for _ in range(6):
                _veilige_agenda_url(url)
                with client.stream("GET", url) as r:
                    if r.status_code in (301, 302, 303, 307, 308):
                        locatie = r.headers.get("location")
                        if not locatie:
                            raise Fout("De agendalink verwijst door zonder bestemming.")
                        url = str(r.url.join(locatie))
                        continue
                    if r.status_code in (401, 403, 404):
                        raise Fout("De agendalink werkt niet (meer). Vraag een nieuwe link op in je agenda.")
                    r.raise_for_status()
                    inhoud = bytearray()
                    for deel in r.iter_bytes():
                        inhoud.extend(deel)
                        if len(inhoud) > 5_000_000:
                            raise Fout("Deze agenda is te groot om veilig op te halen.")
                    return bytes(inhoud)
            raise Fout("De agendalink verwijst te vaak door.")
    except httpx.HTTPError:
        raise Fout("De agendalink is niet bereikbaar.")


def _als_tekst(waarde) -> str:
    return str(waarde) if waarde is not None else ""


def _moment(waarde) -> tuple[str, bool]:
    """Een tijdstip uit de agenda als 'JJJJ-MM-DDTHH:MM' in Nederlandse tijd, of 'JJJJ-MM-DD' voor hele dagen."""
    if isinstance(waarde, datetime):
        if waarde.tzinfo is not None:
            waarde = waarde.astimezone(NL)
        return waarde.strftime("%Y-%m-%dT%H:%M"), False
    return waarde.isoformat(), True


def _soort(titel: str) -> str:
    woorden = set(re.findall(r"[a-zé]+", titel.lower()))
    return next((naam for naam, lijst in SOORT_WOORDEN.items() if woorden & set(lijst)), "afspraak")


def _gebeurtenissen(koppeling: dict, agenda: str, kalender, van: date, tot: date, href: str = "") -> list[dict]:
    import recurring_ical_events

    # Alleen losse afspraken (geen reeksen) zijn vanuit de app te wijzigen, en alleen als je dat hebt aangezet.
    bewerkbaar = bool(href and koppeling.get("schrijven")) and not any(
        c.name == "VEVENT" and c.get("RRULE") is not None for c in kalender.walk())
    uit = []
    for gebeurtenis in recurring_ical_events.of(kalender).between(van, tot + timedelta(days=1)):
        if gebeurtenis.name != "VEVENT" or _als_tekst(gebeurtenis.get("STATUS")).upper() == "CANCELLED":
            continue
        begin = gebeurtenis.get("DTSTART")
        if begin is None:
            continue
        start, hele_dag = _moment(begin.dt)
        eind = gebeurtenis.get("DTEND")
        einde = None
        if eind is not None and not hele_dag:
            einde, _ = _moment(eind.dt)
        elif not hele_dag and gebeurtenis.get("DURATION") is not None:
            einde = (datetime.fromisoformat(start) + gebeurtenis.get("DURATION").dt).strftime("%Y-%m-%dT%H:%M")
        titel = _als_tekst(gebeurtenis.get("SUMMARY")).strip() or "Afspraak"
        uid = _als_tekst(gebeurtenis.get("UID")) or hashlib.sha1(f"{titel}{start}".encode()).hexdigest()[:12]
        if uid.startswith("assistent-") and uid.endswith("@mijn-assistent"):
            continue  # zelf vanuit de app naar je agenda gezet: staat al in de app
        uit.append({"id": f"ext:{koppeling['id']}:{hashlib.sha1(f'{uid}|{start}'.encode()).hexdigest()[:16]}",
                    "titel": titel, "start": start, "einde": einde,
                    "locatie": re.sub(r"\s+", " ", _als_tekst(gebeurtenis.get("LOCATION"))).strip(),
                    "notitie": _als_tekst(gebeurtenis.get("DESCRIPTION")).strip()[:500],
                    "soort": _soort(titel), "extern": True, "bron": koppeling["naam"],
                    "agenda": agenda, "kleur_bron": koppeling.get("kleur"),
                    **({"href": href, "bewerkbaar": True} if bewerkbaar else {})})
    return uit


def _ophalen(koppeling: dict, van: date, tot: date) -> list[dict]:
    from icalendar import Calendar

    if koppeling["soort"] == "apple":
        import caldav

        resultaat = []
        with caldav.DAVClient(url=koppeling.get("url") or ICLOUD, username=koppeling["gebruiker"],
                              password=koppeling["wachtwoord"], timeout=12) as client:
            for kal in client.principal().calendars():
                naam = kal.get_display_name() or "Agenda"
                if naam in koppeling.get("uit", []):
                    continue
                for item in kal.search(start=datetime.combine(van, datetime.min.time()),
                                       end=datetime.combine(tot + timedelta(days=1), datetime.min.time()),
                                       event=True):
                    resultaat += _gebeurtenissen(koppeling, naam, Calendar.from_ical(item.data), van, tot,
                                                 str(item.url))
        return resultaat
    return _gebeurtenissen(koppeling, koppeling["naam"], Calendar.from_ical(_ophalen_link(koppeling["url"])), van, tot)


def _sleutel(koppeling: dict) -> str:
    geheim = f"{opslag._naam.get()}|{koppeling['id']}|{koppeling.get('url')}|{koppeling.get('gebruiker')}|" \
             f"{koppeling.get('wachtwoord')}|{','.join(koppeling.get('uit', []))}|{koppeling.get('schrijven')}"
    return hashlib.sha256(geheim.encode()).hexdigest()


def _haal(sleutel: str, koppeling: dict) -> None:
    """Haalt één koppeling op (in een achtergronddraad) en zet het resultaat in het geheugen."""
    vandaag = date.today()
    with _slot:
        bewaard = _cache.get(sleutel)
    try:
        lijst, fout = _ophalen(koppeling, vandaag - timedelta(days=VENSTER_TERUG),
                               vandaag + timedelta(days=VENSTER_VOORUIT)), None
    except Fout as f:
        lijst, fout = (bewaard[1] if bewaard else []), str(f)
    except Exception:
        lijst, fout = (bewaard[1] if bewaard else []), "Je agenda is even niet bereikbaar."
    with _slot:
        # Na een fout over twee minuten opnieuw proberen in plaats van over vijf.
        _cache[sleutel] = (time.time() - (ONTHOUD_SECONDEN - 120 if fout else 0), lijst, fout)
        _bezig.pop(sleutel, None)


def _venster(koppeling: dict, wachten: float = 1.5) -> tuple[list[dict], str | None]:
    """Alle afspraken van één koppeling in het venster.

    De app wacht nooit lang op een agenda: ophalen gebeurt op de achtergrond. Is er al iets bekend, dan krijg je
    dat meteen (en wordt het daarna ververst); de allereerste keer wachten we hooguit `wachten` seconden.
    """
    sleutel = _sleutel(koppeling)
    with _slot:
        bewaard = _cache.get(sleutel)
        vers = bewaard and time.time() - bewaard[0] < ONTHOUD_SECONDEN
        draad = _bezig.get(sleutel)
        if not vers and draad is None:
            draad = _bezig[sleutel] = threading.Thread(target=_haal, args=(sleutel, dict(koppeling)), daemon=True)
            draad.start()
    if vers:
        return bewaard[1], bewaard[2]
    if bewaard is None and draad is not None:
        draad.join(wachten)
        with _slot:
            bewaard = _cache.get(sleutel)
    return (bewaard[1], bewaard[2]) if bewaard else ([], None)


def afspraken(van: str, tot: str) -> list[dict]:
    """Afspraken uit je gekoppelde agenda's waarvan de start tussen twee datums (inclusief) valt."""
    resultaat = []
    for koppeling in gekoppeld():
        lijst, _ = _venster(koppeling)
        resultaat += [a for a in lijst if van <= a["start"][:10] <= tot]
    return resultaat


def fouten() -> dict[str, str]:
    """Per koppeling de laatste foutmelding, voor in de instellingen."""
    return {k["id"]: f for k in gekoppeld() if (f := _venster(k, wachten=12)[1])}


def vernieuwen() -> None:
    """Meteen opnieuw ophalen (wacht even op het resultaat)."""
    for k in gekoppeld():
        with _slot:
            _cache.pop(_sleutel(k), None)
        _venster(k, wachten=12)


# --- Twee kanten op met Apple ---------------------------------------------------------------------------------------
# De agenda zelf houdt bij wat al is overgezet: elke afspraak uit de app krijgt een vaste UID en een vingerafdruk
# (X-MIJN-ASSISTENT). Bij het bijwerken vergelijken we wat er hoort te staan met wat er staat; alleen het verschil
# gaat over de lijn. Afspraken die je in Apple zelf maakte, raakt dit nooit aan.

UID = "assistent-{}@mijn-assistent"
SCHRIJF_TERUG, SCHRIJF_VOORUIT = 1, 400
_geschreven: dict[str, tuple[float, str]] = {}
_schrijft: dict[str, threading.Thread] = {}
_schrijf_fout: dict[str, str] = {}


def schrijven_aan(koppeling_id: str, agenda: str | None) -> None:
    """Zet wegschrijven naar een Apple-agenda aan (met de naam van die agenda) of uit (None)."""
    lijst = gekoppeld()
    for a in lijst:
        if a["id"] == koppeling_id and a["soort"] == "apple":
            if agenda:
                a["schrijven"] = agenda
            else:
                a.pop("schrijven", None)
    _bewaar(lijst)
    vernieuwen()


def schrijf_koppeling() -> dict | None:
    return next((a for a in gekoppeld() if a["soort"] == "apple" and a.get("schrijven")), None)


def _vingerafdruk(a: dict) -> str:
    velden = [a.get(k) or "" for k in ("titel", "start", "einde", "locatie", "notitie")]
    return hashlib.sha1("|".join(velden).encode()).hexdigest()[:16]


def _ics(a: dict) -> str:
    from icalendar import Calendar, Event

    kal = Calendar()
    kal.add("prodid", "-//Mijn assistent//NL")
    kal.add("version", "2.0")
    e = Event()
    e.add("uid", UID.format(a["id"]))
    e.add("dtstamp", datetime.now(NL))
    e.add("summary", a.get("titel") or "Afspraak")
    if "T" in a["start"]:
        begin = datetime.fromisoformat(a["start"][:16]).replace(tzinfo=NL)
        e.add("dtstart", begin)
        einde = a.get("einde") and "T" in a["einde"] and datetime.fromisoformat(a["einde"][:16]).replace(tzinfo=NL)
        e.add("dtend", einde if einde and einde > begin else begin + timedelta(hours=1))
    else:
        dag = date.fromisoformat(a["start"][:10])
        e.add("dtstart", dag)
        e.add("dtend", dag + timedelta(days=1))
    if a.get("locatie"):
        e.add("location", a["locatie"])
    if a.get("notitie"):
        e.add("description", a["notitie"])
    e.add("x-mijn-assistent", _vingerafdruk(a))
    kal.add_component(e)
    return kal.to_ical().decode()


def _kalender(client, koppeling: dict):
    for k in client.principal().calendars():
        if (k.get_display_name() or "Agenda") == koppeling["schrijven"]:
            return k
    raise Fout(f"De agenda {koppeling['schrijven']} bestaat niet meer in Apple.")


def _wegschrijven(sleutel: str, koppeling: dict, gewenst: dict[str, dict], afdruk: str) -> None:
    import caldav
    from icalendar import Calendar

    vandaag = date.today()
    try:
        with caldav.DAVClient(url=koppeling.get("url") or ICLOUD, username=koppeling["gebruiker"],
                              password=koppeling["wachtwoord"], timeout=15) as client:
            kal = _kalender(client, koppeling)
            staat: dict[str, tuple[str, object]] = {}
            for item in kal.search(start=datetime.combine(vandaag - timedelta(days=SCHRIJF_TERUG), datetime.min.time()),
                                   end=datetime.combine(vandaag + timedelta(days=SCHRIJF_VOORUIT + 1),
                                                        datetime.min.time()), event=True):
                for e in Calendar.from_ical(item.data).walk("VEVENT"):
                    uid = _als_tekst(e.get("UID"))
                    if uid.startswith("assistent-") and uid.endswith("@mijn-assistent"):
                        staat[uid] = (_als_tekst(e.get("X-MIJN-ASSISTENT")), item)
            for uid, a in gewenst.items():
                if uid not in staat:
                    kal.save_event(_ics(a))
                elif staat[uid][0] != _vingerafdruk(a):
                    item = staat[uid][1]
                    item.data = _ics(a)
                    item.save()
            for uid, (_, item) in staat.items():
                if uid not in gewenst:
                    item.delete()
        _schrijf_fout.pop(sleutel, None)
        with _slot:
            _geschreven[sleutel] = (time.time(), afdruk)
    except Fout as f:
        _schrijf_fout[sleutel] = str(f)
    except Exception:
        _schrijf_fout[sleutel] = "Je Apple-agenda is even niet bij te werken."
    finally:
        with _slot:
            _schrijft.pop(sleutel, None)


def wegschrijven_vanzelf(afspraken: list[dict], wachten: float = 0) -> None:
    """Zet je afspraken uit de app in je Apple-agenda, op de achtergrond. Doet niets als er niets veranderd is
    (en hooguit elke 10 minuten een controle, voor wat je in Apple zelf hebt weggehaald)."""
    if not (k := schrijf_koppeling()):
        return
    vandaag = date.today()
    van, tot = (vandaag - timedelta(days=SCHRIJF_TERUG)).isoformat(), (vandaag + timedelta(days=SCHRIJF_VOORUIT)).isoformat()
    gewenst = {UID.format(a["id"]): a for a in afspraken
               if not a.get("extern") and isinstance(a.get("id"), int) and van <= a["start"][:10] <= tot}
    afdruk = hashlib.sha1("".join(sorted(u + _vingerafdruk(a) for u, a in gewenst.items())).encode()).hexdigest()
    sleutel = _sleutel(k)
    with _slot:
        laatst = _geschreven.get(sleutel)
        if (laatst and laatst[1] == afdruk and time.time() - laatst[0] < 600) or sleutel in _schrijft:
            draad = _schrijft.get(sleutel)
        else:
            draad = _schrijft[sleutel] = threading.Thread(target=_wegschrijven, args=(sleutel, dict(k), gewenst, afdruk),
                                                          daemon=True)
            draad.start()
    if wachten and draad:
        draad.join(wachten)


def schrijf_fout() -> str | None:
    return _schrijf_fout.get(_sleutel(k)) if (k := schrijf_koppeling()) else None


def _extern_item(afspraak: dict):
    import caldav

    koppeling = next((k for k in gekoppeld() if afspraak["id"].startswith(f"ext:{k['id']}:")), None)
    if not koppeling or not koppeling.get("schrijven") or not afspraak.get("href"):
        raise Fout("Deze afspraak kun je alleen in je eigen agenda wijzigen.")
    client = caldav.DAVClient(url=koppeling.get("url") or ICLOUD, username=koppeling["gebruiker"],
                              password=koppeling["wachtwoord"], timeout=15)
    item = caldav.Event(client=client, url=afspraak["href"])
    item.load()
    return client, item


def extern_wijzigen(afspraak: dict, titel: str, start: str, einde: str | None, locatie: str) -> None:
    """Wijzigt een (losse) afspraak uit je Apple-agenda, vanuit de app."""
    from icalendar import Calendar

    client, item = _extern_item(afspraak)
    with client:
        kal = Calendar.from_ical(item.data)
        e = next(iter(kal.walk("VEVENT")))
        for veld in ("SUMMARY", "DTSTART", "DTEND", "DURATION", "LOCATION"):
            e.pop(veld, None)
        e.add("summary", titel.strip() or "Afspraak")
        if "T" in start:
            begin = datetime.fromisoformat(start[:16]).replace(tzinfo=NL)
            eind = datetime.fromisoformat(einde[:16]).replace(tzinfo=NL) if einde and "T" in einde else None
            e.add("dtstart", begin)
            e.add("dtend", eind if eind and eind > begin else begin + timedelta(hours=1))
        else:
            e.add("dtstart", date.fromisoformat(start[:10]))
            e.add("dtend", date.fromisoformat(start[:10]) + timedelta(days=1))
        if locatie.strip():
            e.add("location", locatie.strip())
        r = client.put(afspraak["href"], kal.to_ical().decode(), {"Content-Type": "text/calendar; charset=utf-8"})
        if r.status >= 300:
            raise Fout("Je Apple-agenda wilde de wijziging niet opslaan.")
    vernieuwen()


def extern_verwijderen(afspraak: dict) -> None:
    client, _ = _extern_item(afspraak)
    with client:
        client.delete(afspraak["href"])
    vernieuwen()


# --- Andersom: je agenda uit de app in Apple, Google of Outlook -------------------------------------------------------
# Een geheime link (edge function `agenda`, zie sql/agenda_feed.sql). Alleen lezen; een nieuwe link zet de oude uit.

def feed_status() -> dict:
    return opslag._rpc_ik("agenda_feed_status")


def feed_maken(details: bool = True) -> str:
    token = opslag._rpc_ik("agenda_feed_maken", p_details=details)["token"]
    opslag.instellingen_bijwerken(agenda_feed_token=token)
    return token


def feed_uit() -> None:
    opslag._rpc_ik("agenda_feed_uit")
    opslag.instellingen_bijwerken(agenda_feed_token="")


def feed_link(token: str, webcal: bool = False) -> str:
    basis = opslag.SUPABASE_URL.replace("https://", "webcal://" if webcal else "https://")
    return f"{basis}/functions/v1/agenda?t={token}"
