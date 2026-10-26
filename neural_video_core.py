"""Neural Video Studio: validate edit plans, never fake AI processing or renders."""
from dataclasses import dataclass
from pathlib import PurePath

SUPPORTED_EXTENSIONS = frozenset((".mp4", ".mov", ".mkv", ".webm"))
MAX_SOURCES = 8

@dataclass(frozen=True)
class EditPlan:
    project_id: str
    sources: tuple[str, ...]
    notes: str
    status: str = "concept"

def make_edit_plan(project_id: str, sources, notes: str = "") -> EditPlan:
    if not isinstance(project_id, str) or not project_id.strip():
        raise ValueError("Selecteer een bestaand project.")
    if not isinstance(sources, (list, tuple)) or not 1 <= len(sources) <= MAX_SOURCES:
        raise ValueError("Kies 1 tot 8 bronbestanden.")
    validated = []
    for source in sources:
        if not isinstance(source, str) or not source.strip() or len(source) > 255:
            raise ValueError("Ongeldige bestandsnaam.")
        if source.startswith(("/", "\\")) or "/" in source or "\\" in source or source in (".", ".."):
            raise ValueError("Gebruik alleen bestandsnamen zonder paden.")
        if PurePath(source).suffix.lower() not in SUPPORTED_EXTENSIONS:
            raise ValueError("Niet-ondersteund videoformaat.")
        validated.append(source)
    if len(set(validated)) != len(validated):
        raise ValueError("Dubbele bronbestanden.")
    if not isinstance(notes, str) or len(notes) > 500:
        raise ValueError("Montage-instructie is te lang.")
    return EditPlan(project_id.strip(), tuple(validated), notes.strip())

def render_video(*args, **kwargs):
    raise RuntimeError("Rendering is niet beschikbaar zonder geconfigureerde videoverwerker.")

def ai_sync(*args, **kwargs):
    raise RuntimeError("AI-synchronisatie is niet beschikbaar zonder echte verwerking.")

def privacy_blur(*args, **kwargs):
    raise RuntimeError("Gezichtsvervaging is niet beschikbaar zonder echte verwerking.")
