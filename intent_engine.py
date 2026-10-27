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
_PAY = re.compile(r"\b(?:betaal|overmaken|overschrijven|afrekenen|betaalverzoek|factuur|fooi|tip|stuur\s+(?:€\s*)?\d+(?:[.,]\d{1,2})?\s+(?:euro\s+)?naar)\b", re.I)
_SEND = re.compile(r"\b(?:verstuur|verzend|mail\s+naar|stuur\s+een\s+bericht)\b", re.I)
_APPOINTMENT = re.compile(r"\b(?:plan|inplannen|afspraak|overleg|reservering)\b", re.I)


def parse_intent(text: str) -> IntentDraft | None:
    if not isinstance(text, str) or not 1 <= len(text.strip()) <= 2000:
        return None
    # An instruction mentioning several distinct actions must not be routed as
    # a single payment or appointment. The existing assistant can clarify it.
    signals = {
        "betaling": bool(_PAY.search(text)),
        "communicatie": bool(_SEND.search(text)),
        "agenda": bool(_APPOINTMENT.search(text)),
    }
    if sum(signals.values()) > 1:
        return IntentDraft(
            "meervoudig",
            "Deze opdracht bevat meerdere acties. Stel ze aan de assistent of behandel ze één voor één.",
        )
    income = _INCOME.search(text)
    if income:
        amount = float(income.group(1).replace(",", "."))
        if 0 < amount <= 1000000:
            return IntentDraft("inkomsten", f"Concept inkomstenregistratie: € {amount:.2f}. Nog niet geboekt.")
    if _PAY.search(text):
        return IntentDraft("betaling", "Betaling of factuur: controleer gegevens en bevestig via de bestaande betaaltool.")
    if _SEND.search(text):
        return IntentDraft("communicatie", "Stel een bericht op en bevestig verzending in de communicatietool.")
    task = _TASK.match(text)
    if task and task.group(1).strip():
        return IntentDraft("taak", task.group(1).strip()[:200])
    if _APPOINTMENT.search(text):
        return IntentDraft("agenda", "Afspraak voorbereiden: datum, tijd en deelnemer(s) controleren.")
    return None
