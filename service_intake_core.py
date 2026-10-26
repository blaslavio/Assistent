"""Private service intake drafts; no diagnosis, clinical recommendation or calendar sync."""
from dataclasses import dataclass

SERVICES = ("Training", "Massage", "Herstelbegeleiding", "Overige dienstverlening")

@dataclass(frozen=True)
class IntakeDraft:
    service: str
    subject: str
    note: str
    status: str = "concept"

def make_intake_draft(service: str, subject: str, note: str = "") -> IntakeDraft:
    if service not in SERVICES:
        raise ValueError("Ongeldige dienstverlening.")
    if not isinstance(subject, str) or not 1 <= len(subject.strip()) <= 100:
        raise ValueError("Onderwerp moet 1 tot 100 tekens bevatten.")
    if not isinstance(note, str) or len(note) > 250:
        raise ValueError("Notitie mag maximaal 250 tekens bevatten.")
    for value in (subject, note):
        if any((ord(ch) < 32 and ch not in (chr(10), chr(9))) or ord(ch) == 127 for ch in value):
            raise ValueError("Ongeldige tekens in invoer.")
    return IntakeDraft(service, subject.strip(), note.strip())

def recovery_advice(*args, **kwargs):
    raise RuntimeError("Individueel hersteladvies vereist beoordeling en passende veiligheidscontroles.")

def sync_calendar(*args, **kwargs):
    raise RuntimeError("Agendasynchronisatie vereist een gekoppelde agenda en bevestigde actie.")


def save_intake_draft(*args, **kwargs):
    """Fail closed until deployed account/tenant isolation is independently verified.

    Deliberately no environment flag: enabling requires a reviewed code change.
    No payload is validated, logged, forwarded or persisted by this entry point.
    """
    raise RuntimeError("Intakeopslag is uitgeschakeld totdat opslagisolatie is geverifieerd.")
