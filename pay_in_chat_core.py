"""Veilige basis voor Pay-in-Chat. Geen betaling wordt lokaal als voldaan gemarkeerd."""
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from enum import Enum
from uuid import uuid4


class PaymentStatus(str, Enum):
    DRAFT = "concept"
    PENDING = "openstaand"
    PAID = "voldaan"
    FAILED = "mislukt"


@dataclass(frozen=True)
class PaymentRequest:
    reference: str
    description: str
    amount_cents: int
    currency: str = "EUR"
    status: PaymentStatus = PaymentStatus.DRAFT


def create_draft(description: str, amount: str | int | float) -> PaymentRequest:
    """Bereid een verzoek voor zonder geld te verplaatsen."""
    description = description.strip()
    if not description or len(description) > 240:
        raise ValueError("Omschrijving moet 1 tot 240 tekens bevatten.")
    try:
        value = Decimal(str(amount))
    except (InvalidOperation, ValueError):
        raise ValueError("Ongeldig bedrag.") from None
    if not value.is_finite() or value <= 0 or value > Decimal("1000000"):
        raise ValueError("Bedrag buiten toegestane grenzen.")
    cents = value * 100
    if cents != cents.to_integral_value():
        raise ValueError("Gebruik maximaal twee decimalen.")
    return PaymentRequest(reference=f"REQ-{uuid4().hex[:12].upper()}", description=description, amount_cents=int(cents))


def verified_payment_status(*, provider_verified: bool, provider_status: str,
                            provider_reference: str, expected_reference: str,
                            amount_cents: int, expected_amount_cents: int,
                            currency: str = "EUR") -> PaymentStatus:
    """Alleen aanroepen na server-side verificatie van een provider webhook/API."""
    if provider_verified is not True:
        raise PermissionError("Betaalprovider-verificatie ontbreekt.")
    if (not isinstance(provider_reference, str) or not provider_reference.strip()
            or not isinstance(expected_reference, str) or not expected_reference.strip()
            or type(amount_cents) is not int or type(expected_amount_cents) is not int
            or amount_cents <= 0 or expected_amount_cents <= 0):
        raise ValueError("Betalingsreferentie of bedrag ontbreekt of is ongeldig.")
    if provider_reference != expected_reference or amount_cents != expected_amount_cents or currency != "EUR":
        raise ValueError("Betalingsgegevens komen niet overeen.")
    if provider_status == "paid":
        return PaymentStatus.PAID
    if provider_status in ("failed", "canceled", "cancelled", "expired"):
        return PaymentStatus.FAILED
    return PaymentStatus.PENDING
