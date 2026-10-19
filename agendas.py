"""Je bestaande agenda's in de app: Apple (iCloud), en via een agendalink ook Google, Outlook en andere.

De app leest je afspraken (alleen lezen) en zet ze naast de afspraken die je in de app maakt, zodat de
assistent rond je echte agenda plant, reistijden uitrekent en op tijd waarschuwt.
- Apple: met je Apple ID en een app-specifiek wachtwoord (hetzelfde soort wachtwoord als voor je mail).
- Google, Outlook en andere: met de geheime agendalink (iCal/ICS) die je in die agenda opvraagt.
Afspraken worden een paar minuten onthouden, zodat de app niet bij elke klik opnieuw hoeft te vragen.
"""

import hashlib
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


class Fout(Exception):
    """Koppelen lukte niet; de tekst is geschikt om aan de gebruiker te tonen."""


def gekoppeld() -> list[dict]:
    return opslag.instellingen().get("agendas", [])


def _bewaar(lijst: list[dict]) -> None:
    opslag.instellingen_bijwerken(agendas=lijst)
    _cache.clear()


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


def _ophalen_link(url: str) -> bytes:
    try:
        r = httpx.get(url, timeout=12, follow_redirects=True, headers={"User-Agent": "MijnAssistent/1.0"})
    except httpx.HTTPError:
        raise Fout("De agendalink is niet bereikbaar.")
    if r.status_code in (401, 403, 404):
        raise Fout("De agendalink werkt niet (meer). Vraag een nieuwe link op in je agenda.")
    r.raise_for_status()
    return r.content


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


def _gebeurtenissen(koppeling: dict, agenda: str, kalender, van: date, tot: date) -> list[dict]:
    import recurring_ical_events

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
                    "agenda": agenda, "kleur_bron": koppeling.get("kleur")})
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
                    resultaat += _gebeurtenissen(koppeling, naam, Calendar.from_ical(item.data), van, tot)
        return resultaat
    return _gebeurtenissen(koppeling, koppeling["naam"], Calendar.from_ical(_ophalen_link(koppeling["url"])), van, tot)


def _sleutel(koppeling: dict) -> str:
    geheim = f"{opslag._naam.get()}|{koppeling['id']}|{koppeling.get('url')}|{koppeling.get('gebruiker')}|" \
             f"{koppeling.get('wachtwoord')}|{','.join(koppeling.get('uit', []))}"
    return hashlib.sha256(geheim.encode()).hexdigest()


def _venster(koppeling: dict) -> tuple[list[dict], str | None]:
    """Alle afspraken van één koppeling in het venster, uit het geheugen als dat nog vers is."""
    sleutel = _sleutel(koppeling)
    nu = time.time()
    with _slot:
        bewaard = _cache.get(sleutel)
    if bewaard and nu - bewaard[0] < ONTHOUD_SECONDEN:
        return bewaard[1], bewaard[2]
    vandaag = date.today()
    try:
        lijst, fout = _ophalen(koppeling, vandaag - timedelta(days=VENSTER_TERUG),
                               vandaag + timedelta(days=VENSTER_VOORUIT)), None
    except Fout as f:
        lijst, fout = (bewaard[1] if bewaard else []), str(f)
    except Exception:
        lijst, fout = (bewaard[1] if bewaard else []), "Je agenda is even niet bereikbaar."
    with _slot:
        # Na een fout over twee minuten opnieuw proberen in plaats van over vijf.
        _cache[sleutel] = (nu - (ONTHOUD_SECONDEN - 120 if fout else 0), lijst, fout)
    return lijst, fout


def afspraken(van: str, tot: str) -> list[dict]:
    """Afspraken uit je gekoppelde agenda's waarvan de start tussen twee datums (inclusief) valt."""
    resultaat = []
    for koppeling in gekoppeld():
        lijst, _ = _venster(koppeling)
        resultaat += [a for a in lijst if van <= a["start"][:10] <= tot]
    return resultaat


def fouten() -> dict[str, str]:
    """Per koppeling de laatste foutmelding, voor in de instellingen."""
    return {k["id"]: f for k in gekoppeld() if (f := _venster(k)[1])}


def vernieuwen() -> None:
    _cache.clear()
