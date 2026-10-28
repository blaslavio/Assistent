"""Event Swarm: private event planning, no simulated ticket confirmations.

A capacity check is advisory only. Real ticket claims need a database transaction,
authenticated user, unique ticket and verified payment where applicable.
"""
from dataclasses import dataclass
from datetime import datetime
from uuid import uuid4

@dataclass(frozen=True)
class EventDraft:
    id: str
    title: str
    capacity: int
    starts_at: str
    status: str = "concept"

def create_event_draft(title: str, capacity: int, starts_at: str) -> EventDraft:
    if not isinstance(title, str) or not 1 <= len(title.strip()) <= 120:
        raise ValueError("Evenementnaam moet 1 tot 120 tekens bevatten.")
    if not isinstance(capacity, int) or isinstance(capacity, bool) or not 1 <= capacity <= 100000:
        raise ValueError("Capaciteit moet tussen 1 en 100000 liggen.")
    try:
        parsed = datetime.fromisoformat(starts_at)
    except (TypeError, ValueError):
        raise ValueError("Ongeldige datum of tijd.") from None
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError("Een tijdzone is verplicht.")
    return EventDraft(uuid4().hex, title.strip(), capacity, parsed.isoformat())

def capacity_available(capacity: int, confirmed_count: int) -> bool:
    """Display hint only; never use this to grant a ticket."""
    if not all(isinstance(n, int) and not isinstance(n, bool) for n in (capacity, confirmed_count)):
        raise ValueError("Ongeldige aantallen.")
    if capacity < 1 or confirmed_count < 0:
        raise ValueError("Ongeldige aantallen.")
    return confirmed_count < capacity

def request_ticket(*args, **kwargs):
    raise RuntimeError("Tickets kunnen pas worden geclaimd na veilige database- en betaalintegratie.")
