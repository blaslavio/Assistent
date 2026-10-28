"""Scoped context and conservative scenario simulation primitives."""
from dataclasses import dataclass
from decimal import Decimal
from typing import Iterable


@dataclass(frozen=True)
class ContextFact:
    tenant_id: str
    subject_id: str
    key: str
    value: str
    source: str


def facts_for_subject(facts: Iterable[ContextFact], *, tenant_id: str,
                      subject_id: str) -> tuple[ContextFact, ...]:
    """Never cross tenant or subject boundaries."""
    if not tenant_id or not subject_id:
        raise ValueError("Tenant and subject are required")
    return tuple(f for f in facts if f.tenant_id == tenant_id and f.subject_id == subject_id)


@dataclass(frozen=True)
class RevenueScenario:
    baseline: Decimal
    projected: Decimal
    delta: Decimal


def simulate_price_change(*, unit_price: Decimal, quantity: int,
                          change_percent: Decimal) -> RevenueScenario:
    """Simple gross revenue scenario, excluding taxes, churn and costs."""
    if not isinstance(unit_price, Decimal) or not isinstance(change_percent, Decimal):
        raise TypeError("Decimal values required")
    if not unit_price.is_finite() or not change_percent.is_finite():
        raise ValueError("Finite values required")
    if unit_price < 0 or quantity < 0 or change_percent < Decimal("-100"):
        raise ValueError("Invalid scenario")
    baseline = unit_price * quantity
    projected = baseline * (Decimal("1") + change_percent / Decimal("100"))
    return RevenueScenario(baseline, projected, projected - baseline)
