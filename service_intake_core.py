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
        if any(ord(ch) < 32 and ch not in "\\n\\t" or ord(ch) == 127 for ch in value):
            raise ValueError("Ongeldige tekens in invoer.")
    return IntakeDraft(service, subject.strip(), note.strip())

def recovery_advice(*args, **kwargs):
    raise RuntimeError("Individueel hersteladvies vereist beoordeling en passende veiligheidscontroles.")

def sync_calendar(*args, **kwargs):
    raise RuntimeError("Agendasynchronisatie vereist een gekoppelde agenda en bevestigde actie.")
