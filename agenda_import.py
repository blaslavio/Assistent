"""Privacyvriendelijke import van bestaande afspraken uit een iCalendar (.ics) bestand.

Geen upload naar externe AI-diensten. Eerst een voorbeeld, dan pas opslaan.
"""
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
import re

MAX_BYTES = 2_000_000
MAX_EVENTS = 500
LOCAL_ZONE = ZoneInfo("Europe/Amsterdam")


def _regels(raw: bytes) -> list[str]:
    if len(raw) > MAX_BYTES:
        raise ValueError("Het agenda-bestand is te groot (maximaal 2 MB).")
    try:
        data = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ValueError("Gebruik een UTF-8 iCalendar-bestand.") from exc
    if "BEGIN:VCALENDAR" not in data:
        raise ValueError("Dit is geen geldig iCalendar-bestand.")
    regels = data.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    unfolded = []
    for line in regels:
        if line.startswith((" ", "\t")) and unfolded:
            unfolded[-1] += line[1:]
        else:
            unfolded.append(line)
    return unfolded


def _tijd(waarde: str, zone: str = "") -> datetime:
    if re.fullmatch(r"\d{8}", waarde):
        return datetime.strptime(waarde, "%Y%m%d").replace(tzinfo=LOCAL_ZONE)
    if not re.fullmatch(r"\d{8}T\d{6}Z?", waarde):
        raise ValueError("Onbekend tijdformaat in agenda.")
    utc = waarde.endswith("Z")
    moment = datetime.strptime(waarde.rstrip("Z"), "%Y%m%dT%H%M%S")
    tz = timezone.utc if utc else (ZoneInfo(zone) if zone else LOCAL_ZONE)
    return moment.replace(tzinfo=tz).astimezone(LOCAL_ZONE)


def _tekst(waarde: str) -> str:
    return waarde.replace("\\n", "\n").replace("\\,", ",").replace("\\;", ";").replace("\\\\", "\\")


def lezen(raw: bytes) -> list[dict]:
    """Parseer eenvoudige VEVENTs. Recurring RRULEs worden niet stilzwijgend uitgeklapt."""
    result = []
    event = None
    for line in _regels(raw):
        if line == "BEGIN:VEVENT":
            event = {}
        elif line == "END:VEVENT" and event is not None:
            if event.get("RRULE"):
                event = None
                continue
            if "DTSTART" in event and "SUMMARY" in event:
                start = _tijd(*event["DTSTART"])
                einde = _tijd(*event["DTEND"]) if "DTEND" in event else start + timedelta(hours=1)
                if einde > start:
                    result.append({
                        "titel": _tekst(event["SUMMARY"][0])[:150],
                        "start": start.strftime("%Y-%m-%dT%H:%M"),
                        "einde": einde.strftime("%Y-%m-%dT%H:%M"),
                        "locatie": _tekst(event.get("LOCATION", ("", ""))[0])[:250],
                        "notitie": _tekst(event.get("DESCRIPTION", ("", ""))[0])[:1000],
                    })
                if len(result) > MAX_EVENTS:
                    raise ValueError("Importeer maximaal 500 afspraken tegelijk.")
            event = None
        elif event is not None and ":" in line:
            k, value = line.split(":", 1)
            name = k.split(";", 1)[0].upper()
            if name in ("SUMMARY", "DTSTART", "DTEND", "LOCATION", "DESCRIPTION", "RRULE"):
                match = re.search(r"TZID=([^;:]+)", k, flags=re.I)
                event[name] = (value, match.group(1) if match else "")
    return result


def uniek(nieuw: list[dict], bestaand: list[dict]) -> list[dict]:
    gezien = {(x.get("titel", "").casefold().strip(), x.get("start", "")[:16])
              for x in bestaand}
    resultaat = []
    for item in nieuw:
        key = (item["titel"].casefold().strip(), item["start"][:16])
        if key not in gezien:
            resultaat.append(item)
            gezien.add(key)
    return resultaat


def conflicten(nieuw: list[dict], bestaand: list[dict]) -> list[dict]:
    """Detecteer overlappende tijdsloten; lees enkel tijdstippen, niet privé-inhoud."""
    def lokaal(waarde: str) -> datetime:
        moment = datetime.fromisoformat(waarde)
        return moment.astimezone(LOCAL_ZONE).replace(tzinfo=None) if moment.tzinfo else moment

    aanwezig = []
    for item in bestaand:
        try:
            begin = lokaal(item["start"])
            einde = lokaal(item.get("einde") or item["start"])
            if einde <= begin:
                einde = begin + timedelta(hours=1)
            aanwezig.append((begin, einde))
        except (KeyError, ValueError, TypeError):
            continue
    conflicten = []
    for item in nieuw:
        begin = datetime.fromisoformat(item["start"])
        einde = lokaal(item["einde"])
        if any(begin < eind and einde > start for start, eind in aanwezig):
            conflicten.append(item)
        aanwezig.append((begin, einde))
    return conflicten


def voorstellen(bestaand: list[dict], minuten: int = 30, limiet: int = 3,
                nu: datetime | None = None) -> list[datetime]:
    """Vrije momenten tijdens kantooruren; suggesties zijn geen definitieve reserveringen."""
    nu = nu or datetime.now(LOCAL_ZONE)
    dagen = []
    for i in range(1, 15):
        dag = (nu + timedelta(days=i)).date()
        if dag.weekday() >= 5:
            continue
        for uur in range(9, 17):
            for minuut in (0, 30):
                start = datetime(dag.year, dag.month, dag.day, uur, minuut)
                einde = start + timedelta(minutes=minuten)
                if not conflicten([{"start": start.isoformat(), "einde": einde.isoformat()}], bestaand):
                    dagen.append(start)
                    if len(dagen) == limiet:
                        return dagen
    return dagen


VOORKEUREN = ("Balans tussen werk en privé", "Zo veel mogelijk aaneengesloten afspraken",
              "Ruimte tussen afspraken")


def voorkeur_uit_feedback(feedback: list[str], standaard: str = VOORKEUREN[0]) -> str:
    """Leer uitsluitend van expliciet gegeven beoordelingen, niet van afspraakinhoud."""
    scores = {keuze: 0 for keuze in VOORKEUREN}
    for item in feedback[-30:]:
        if item in scores:
            scores[item] += 1
    beste = max(scores, key=scores.get)
    return beste if scores[beste] >= 2 else standaard


def voorstellen_op_voorkeur(bestaand: list[dict], voorkeur: str, limiet: int = 3,
                           nu: datetime | None = None) -> list[datetime]:
    """Rangschik vrije momenten volgens de door gebruiker gekozen/geleerde voorkeur."""
    kandidaten = voorstellen(bestaand, limiet=80, nu=nu)
    if voorkeur == "Zo veel mogelijk aaneengesloten afspraken":
        grenzen = set()
        for afspraak in bestaand:
            try:
                grenzen.add(datetime.fromisoformat(afspraak["start"]).replace(tzinfo=None))
                if afspraak.get("einde"):
                    grenzen.add(datetime.fromisoformat(afspraak["einde"]).replace(tzinfo=None))
            except (ValueError, TypeError, KeyError):
                pass
        kandidaten.sort(key=lambda moment: (min((abs((moment - grens).total_seconds())
                                                  for grens in grenzen), default=float("inf")), moment))
    elif voorkeur == "Ruimte tussen afspraken":
        grenzen = []
        for afspraak in bestaand:
            for key in ("start", "einde"):
                if afspraak.get(key):
                    try:
                        grenzen.append(datetime.fromisoformat(afspraak[key]).replace(tzinfo=None))
                    except (ValueError, TypeError):
                        pass
        kandidaten.sort(key=lambda moment: (-min((abs((moment - grens).total_seconds())
                                                   for grens in grenzen), default=0), moment))
    return kandidaten[:limiet]
