"""Pure validation layer for proposed escrow requests.

No payment, balance or escrow state is modified here. A trusted backend must
perform atomic, authorized settlement after provider confirmation.
"""
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import re

MONEY = Decimal("0.01")
MAX_AMOUNT = Decimal("1000000.00")
AMOUNT_PATTERN = re.compile(
    r"(?<![\w])(?:€\s*)?(\d{1,9}(?:[.,]\d{1,2})?)(?:\s*(?:euro|eur))?(?![\w.,\d])",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class EscrowProposal:
    description: str
    amount: Decimal
    fee: Decimal
    net: Decimal


def parse_amount(text: str) -> Decimal:
    if not isinstance(text, str):
        raise ValueError("Amount must be text.")
    if re.search(r"\d+[.,]\d{3,}", text):
        raise ValueError("Amount has more than two decimal places.")
    matches = AMOUNT_PATTERN.findall(text)
    if len(matches) != 1:
        raise ValueError("Specify exactly one amount with up to two decimals.")
    try:
        value = Decimal(matches[0].replace(",", "."))
    except InvalidOperation as exc:
        raise ValueError("Invalid amount.") from exc
    if not Decimal("0.01") <= value <= MAX_AMOUNT:
        raise ValueError("Amount out of range.")
    return value.quantize(MONEY)


def prepare_escrow_proposal(description: str, amount: str) -> EscrowProposal:
    if not isinstance(description, str) or not 1 <= len(description.strip()) <= 200:
        raise ValueError("Description must be 1–200 characters.")
    value = parse_amount(amount)
    fee = (value * Decimal("0.05")).quantize(MONEY, rounding=ROUND_HALF_UP)
    return EscrowProposal(description.strip(), value, fee, value - fee)


def assert_transition(current: str, requested: str, *, authorized: bool,
                      provider_confirmed: bool) -> None:
    """Fail closed. This does NOT execute a transition."""
    allowed = {"pending": {"held"}, "held": {"released", "refunded"}}
    if not authorized:
        raise PermissionError("Authorized operator required.")
    if requested not in allowed.get(current, set()):
        raise ValueError("Invalid or repeated escrow transition.")
    if not provider_confirmed:
        raise PermissionError("Verified payment-provider event required.")
