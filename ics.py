"""Afspraken als .ics-bestand, zodat ze in Apple Agenda (of een andere agenda) komen.

Met een melding op de vertrektijd: zo krijg je op je iPhone of iPad een seintje
wanneer je weg moet.
"""

from datetime import datetime, timedelta, timezone

VOORAF_ZONDER_REIS = 30  # minuten


def _tekst(waarde: str) -> str:
    return waarde.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def _tijd(moment: datetime) -> str:
    return moment.strftime("%Y%m%dT%H%M%S")


def _gebeurtenis(regel: dict) -> list[str]:
    """Eén VEVENT. regel is een afspraak, eventueel met reis en contact uit de dagplanning."""
    regels = ["BEGIN:VEVENT", f"UID:assistent-{regel['id']}@mijn-assistent",
              f"DTSTAMP:{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}", f"SUMMARY:{_tekst(regel['titel'])}"]
    if "T" in regel["start"]:
        start = datetime.fromisoformat(regel["start"])
        einde = datetime.fromisoformat(regel["einde"]) if regel.get("einde") and "T" in regel["einde"] else start + timedelta(hours=1)
        regels += [f"DTSTART;TZID=Europe/Amsterdam:{_tijd(start)}", f"DTEND;TZID=Europe/Amsterdam:{_tijd(einde)}"]
    else:
        dag = datetime.fromisoformat(regel["start"][:10])
        regels += [f"DTSTART;VALUE=DATE:{dag:%Y%m%d}", f"DTEND;VALUE=DATE:{dag + timedelta(days=1):%Y%m%d}"]
    if regel.get("locatie"):
        regels.append(f"LOCATION:{_tekst(regel['locatie'])}")
    beschrijving = []
    if contact := regel.get("contact"):
        beschrijving.append(f"Met {contact['naam']}" + (f" ({contact['telefoon']})" if contact.get("telefoon") else ""))
    if regel.get("notitie"):
        beschrijving.append(regel["notitie"])
    if beschrijving:
        regels.append(f"DESCRIPTION:{_tekst(chr(10).join(beschrijving))}")
    if "T" in regel["start"]:
        reis = regel.get("reis")
        vooraf = reis["reistijd_minuten"] + 10 if reis else VOORAF_ZONDER_REIS
        melding = f"Vertrek nu naar {regel['titel']}" if reis else f"Over {VOORAF_ZONDER_REIS} minuten: {regel['titel']}"
        regels += ["BEGIN:VALARM", "ACTION:DISPLAY", f"DESCRIPTION:{_tekst(melding)}",
                   f"TRIGGER:-PT{vooraf}M", "END:VALARM"]
    regels.append("END:VEVENT")
    return regels


def bestand(afspraken: list[dict]) -> bytes:
    regels = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Mijn assistent//NL", "CALSCALE:GREGORIAN",
              "BEGIN:VTIMEZONE", "TZID:Europe/Amsterdam",
              "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST", "DTSTART:19700329T020000",
              "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT",
              "BEGIN:STANDARD", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET", "DTSTART:19701025T030000",
              "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD", "END:VTIMEZONE"]
    for afspraak in afspraken:
        regels += _gebeurtenis(afspraak)
    regels.append("END:VCALENDAR")
    return ("\r\n".join(regels) + "\r\n").encode()
