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
