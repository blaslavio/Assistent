"""Private multi-stream classification and filtering, without publication side effects.

Classification is advisory. Saving a draft never creates a booking, map marker,
payment, listing or external AI request.
"""
import re
from dataclasses import dataclass

LENSES = ("Alles", "Verkoop", "Chat", "Projecten", "Community", "Video Project", "Verhuur / Rooster", "Sport", "Dienstverlening", "Herstel & Coaching")

@dataclass(frozen=True)
class StreamDraft:
    category: str
    text: str
    status: str = "concept"

_PATTERNS = (
    ("Herstel & Coaching", r"\b(herstel|massage|stijf|stijfheid|blessure|klacht|klachten|cliënt|client)\b"),
    ("Dienstverlening", r"\b(dienst|diensten|dienstverlening|pass|micro-pass)\b"),
    ("Video Project", r"\b(video|videoproject|film|montage|timeline|videobewerking|reel)\b"),
    ("Verhuur / Rooster", r"\b(verhuur|verhuren|zaal huren|ruimte huren|rooster|materiaal huren|stoel huren)\b"),
    ("Sport", r"\b(trainer|sport|sportvereniging|wedstrijd|voetbal|voetbalwedstrijd|bokstraining|training|scheidsrechter|bardienst)\b"),
    ("Verkoop", r"\b(winkel|verkoop|verkopen|te koop|advertentie|marktplaats|webshop|product aanbieden)\b"),
    ("Projecten", r"\b(project|projecten|taak|deadline|mijlpaal)\b"),
    ("Community", r"\b(community|groep|swarm|event|evenement|club|organiseer|publieke bijdrage|deel met de groep|buurtborrel)\b"),
)

def classify(text: str) -> str:
    if not isinstance(text, str) or not text.strip():
        return "Chat"
    for label, pattern in _PATTERNS:
        if re.search(pattern, text, re.I):
            return label
    return "Chat"

def make_draft(text: str) -> StreamDraft:
    if not isinstance(text, str) or not 1 <= len(text.strip()) <= 500:
        raise ValueError("Bericht moet 1 tot 500 tekens bevatten.")
    if any((ord(char) < 32 and char not in "\n\t") or ord(char) == 127 for char in text):
        raise ValueError("Bericht bevat ongeldige besturingstekens.")
    return StreamDraft(classify(text), text.strip())

def filter_drafts(drafts: list[dict], lens: str) -> list[dict]:
    if lens not in LENSES:
        raise ValueError("Onbekende filter.")
    return [d for d in drafts if isinstance(d, dict) and
            (lens == "Alles" or d.get("category") == lens)]
