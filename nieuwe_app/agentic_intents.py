"""Veilige bouwstenen voor agentische opdrachten (geen productiebetalingen).

Deze module is bewust onafhankelijk van Streamlit en externe API's.
Integratie met authenticatie, RLS en echte betaalproviders vereist afzonderlijke review.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from enum import Enum
import re
from uuid import uuid4


class Intent(str, Enum):
    SOCIAL_POST = "social_post"
    MEMBERSHIP = "membership"
    ESCROW = "escrow"
    DISPUTE = "dispute"
    UNKNOWN = "unknown"


@dataclass(frozen=True)
class ProposedAction:
    id: str
    intent: Intent
    description: str
    amount: Decimal | None = None
    currency: str = "EUR"
    status: str = "requires_confirmation"


def parse_amount(text: str) -> Decimal | None:
    """Accepteer alleen expliciete eurobedragen, nooit willekeurige getallen."""
    match = re.search(r"(?:€\s*(\d+(?:[.,]\d{1,2})?)|(\d+(?:[.,]\d{1,2})?)\s*(?:euro|eur)\b)", text, re.I)
    if not match:
        return None
    try:
        value = Decimal((match.group(1) or match.group(2)).replace(",", "."))
    except InvalidOperation:
        return None
    return value if Decimal("0") < value <= Decimal("1000000") else None


def classify_intent(text: str) -> Intent:
    """Beperkte, expliciete commandoparser; geen LLM en geen automatische acties."""
    p = text.strip().lower()
    if re.match(r"^(?:geschil|arbitrage|conflict|betwist)\b", p):
        return Intent.DISPUTE
    if re.match(r"^(?:maak|start|creëer)\s+(?:een\s+)?(?:lidmaatschap|abonnement|membership)\b", p):
        return Intent.MEMBERSHIP
    if re.match(r"^(?:maak|start|creëer)\s+(?:een\s+)?escrow\b", p):
        return Intent.ESCROW
    if re.match(r"^(?:plaats|publiceer)\s+(?:een\s+)?(?:post|bericht)\b", p):
        return Intent.SOCIAL_POST
    return Intent.UNKNOWN


def propose(text: str) -> ProposedAction | None:
    """Produceert uitsluitend een concept; schrijft niets weg en verplaatst geen geld."""
    intent = classify_intent(text)
    if intent == Intent.UNKNOWN:
        return None
    description = text.strip()[:2000]
    amount = parse_amount(text) if intent in (Intent.MEMBERSHIP, Intent.ESCROW) else None
    if intent in (Intent.MEMBERSHIP, Intent.ESCROW) and amount is None:
        raise ValueError("Vermeld een geldig eurobedrag.")
    if intent == Intent.SOCIAL_POST and len(description) < 15:
        raise ValueError("Vermeld de inhoud van het bericht.")
    return ProposedAction(id=str(uuid4()), intent=intent, description=description, amount=amount)


def confirmation_requirements(action: ProposedAction) -> tuple[str, ...]:
    """Voorwaarden die de integratielaag server-side moet afdwingen."""
    common = ("authenticated_user", "authorized_scope", "explicit_confirmation", "idempotency_key", "audit_log")
    if action.intent in (Intent.ESCROW, Intent.MEMBERSHIP):
        return common + ("verified_payment_provider", "verified_webhook", "atomic_database_transaction")
    if action.intent == Intent.SOCIAL_POST:
        return common + ("validated_publication_target",)
    return common


def calculate_platform_fee(amount: Decimal, rate: Decimal) -> Decimal:
    """Fee is configuratie, geen impliciet contract of werkelijk afgeschreven bedrag."""
    if amount <= 0 or not Decimal("0") <= rate <= Decimal("1"):
        raise ValueError("Ongeldig bedrag of tarief.")
    return (amount * rate).quantize(Decimal("0.01"))
