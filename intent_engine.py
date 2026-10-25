"""Conservative zero-click intent drafts. No money movement or external side effects."""
import re
from dataclasses import dataclass

@dataclass(frozen=True)
class IntentDraft:
    kind: str
    description: str
    confirmation_required: bool = True

_TASK = re.compile(r"^\s*(?:maak|voeg toe|noteer|herinner me)\s+(?:een\s+)?taak\s*(?:voor|om|:)\s*(.+)$", re.I)
_INCOME = re.compile(r"\b(?:ontvangen|ontving|gekregen)\s+(?:€\s*)?(\d+(?:[.,]\d{1,2})?)\s*(?:euro|€)?\s+(?:fooi|inkomsten)\b", re.I)
_PAY = re.compile(r"\b(?:betaal|overmaken|overschrijven|afrekenen|betaalverzoek|factuur)\b", re.I)
_SEND = re.compile(r"\b(?:verstuur|verzend|mail\s+naar|stuur\s+een\s+bericht)\b", re.I)
_APPOINTMENT = re.compile(r"\b(?:plan|inplannen|afspraak|reservering)\b", re.I)


def parse_intent(text: str) -> IntentDraft | None:
    if not isinstance(text, str) or not 1 <= len(text.strip()) <= 2000:
        return None
    if _PAY.search(text):
        return IntentDraft("betaling", "Betaling of factuur: controleer gegevens en bevestig via de bestaande betaaltool.")
    if _SEND.search(text):
        return IntentDraft("communicatie", "Stel een bericht op en bevestig verzending in de communicatietool.")
    income = _INCOME.search(text)
    if income:
        amount = float(income.group(1).replace(",", "."))
        if 0 < amount <= 1000000:
            return IntentDraft("inkomsten", f"Concept inkomstenregistratie: € {amount:.2f}. Nog niet geboekt.")
    task = _TASK.match(text)
    if task and task.group(1).strip():
        return IntentDraft("taak", task.group(1).strip()[:200])
    if _APPOINTMENT.search(text):
        return IntentDraft("agenda", "Afspraak voorbereiden: datum, tijd en deelnemer(s) controleren.")
    return None
