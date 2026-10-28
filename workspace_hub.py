"""Kleine, veilige bouwstenen voor de centrale agenda- en communicatiehub.

Deze module doet geen externe acties: mutaties zijn expliciet en pas na bevestiging.
"""
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from zoneinfo import ZoneInfo

LOCAL_TZ = ZoneInfo("Europe/Amsterdam")


class Scope(str, Enum):
    PERSONAL = "prive"
    BUSINESS = "zakelijk"


class Intent(str, Enum):
    APPOINTMENT = "afspraak"
    PAYMENT = "betaling"
    MESSAGE = "bericht"
    SERVICE = "dienst"
    UNKNOWN = "onbekend"


@dataclass(frozen=True)
class HubCommand:
    intent: Intent
    scope: Scope
    text: str
    requires_confirmation: bool


def classify_command(text: str, scope: str = "prive") -> HubCommand:
    """Conservatieve router: bij twijfel geen actie ondernemen."""
    if not isinstance(text, str) or not text.strip():
        raise ValueError("Een opdracht is verplicht.")
    if len(text) > 4000:
        raise ValueError("Opdracht is te lang.")
    try:
        selected_scope = Scope(scope)
    except ValueError:
        raise ValueError("Kies prive of zakelijk.") from None
    lowered = text.casefold()
    matches = []
    keywords = {
        Intent.PAYMENT: ("betaalverzoek", "factuur", "afrekenen", "betaling"),
        Intent.APPOINTMENT: ("afspraak", "agenda", "inplannen", "reservering"),
        Intent.MESSAGE: ("e-mail", "email", "mail sturen", "bericht sturen"),
        Intent.SERVICE: ("intake", "kennismaking", "personal training", "dienstverlening"),
    }
    for intent, words in keywords.items():
        if any(word in lowered for word in words):
            matches.append(intent)
    intent = matches[0] if len(matches) == 1 else Intent.UNKNOWN
    return HubCommand(intent=intent, scope=selected_scope, text=text.strip(),
                      requires_confirmation=intent != Intent.UNKNOWN)


def validate_appointment(title: str, start: datetime, end: datetime, scope: str) -> dict:
    """Normaliseer afspraakdata, maar sla niets op en verstuur niets."""
    if not isinstance(title, str) or not 1 <= len(title.strip()) <= 200:
        raise ValueError("Afspraaktitel moet 1 tot 200 tekens bevatten.")
    selected_scope = Scope(scope)
    if start.tzinfo is None or end.tzinfo is None:
        raise ValueError("Afspraken vereisen een tijdzone.")
    if end <= start:
        raise ValueError("Eindtijd moet na de begintijd liggen.")
    if (end - start).total_seconds() > 86400:
        raise ValueError("Een afspraak mag maximaal 24 uur duren.")
    return {"title": title.strip(), "start": start.astimezone(LOCAL_TZ).isoformat(),
            "end": end.astimezone(LOCAL_TZ).isoformat(), "scope": selected_scope.value,
            "status": "concept"}
