"""Safe integration contracts for future beta providers."""
from dataclasses import dataclass
from enum import Enum


class ProviderMode(str, Enum):
    DISABLED = "disabled"
    SANDBOX = "sandbox"
    LIVE = "live"


@dataclass(frozen=True)
class ProviderResult:
    mode: ProviderMode
    status: str
    external_id: str | None = None


def disabled_payment(order_id: str, amount_cents: int) -> ProviderResult:
    """Never initiate or report a completed payment."""
    if not order_id.strip() or amount_cents <= 0:
        raise ValueError("Invalid payment request")
    return ProviderResult(ProviderMode.DISABLED, "unavailable")


def disabled_ai(prompt: str) -> ProviderResult:
    """Never imply an external AI call succeeded."""
    if not prompt.strip():
        raise ValueError("Prompt is required")
    return ProviderResult(ProviderMode.DISABLED, "unavailable")
