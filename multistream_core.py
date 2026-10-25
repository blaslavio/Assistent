"""Private multi-stream classification and filtering, without publication side effects."""
import re
from dataclasses import dataclass

LENSES = ("Alles", "Verkoop", "Chat", "Projecten", "Community")

@dataclass(frozen=True)
class StreamDraft:
    category: str
    text: str
    status: str = "concept"

def classify(text: str) -> str:
    if not isinstance(text, str) or not text.strip():
        return "Chat"
    patterns = (
        ("Verkoop", r"\b(verkoop|te koop|advertentie|marktplaats|product aanbieden)\b"),
        ("Projecten", r"\b(project|projecten|taak|deadline|mijlpaal)\b"),
        ("Community", r"\b(community|publieke bijdrage|deel met de groep)\b"),
    )
    for label, pattern in patterns:
        if re.search(pattern, text, re.I):
            return label
    return "Chat"

def make_draft(text: str) -> StreamDraft:
    if not isinstance(text, str) or not 1 <= len(text.strip()) <= 500:
        raise ValueError("Bericht moet 1 tot 500 tekens bevatten.")
    return StreamDraft(classify(text), text.strip())

def filter_drafts(drafts: list[dict], lens: str) -> list[dict]:
    if lens not in LENSES:
        raise ValueError("Onbekende filter.")
    return [d for d in drafts if isinstance(d, dict) and
            (lens == "Alles" or d.get("category") == lens)]
