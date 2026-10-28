"""Deterministic, side-effect-free workflow planning for Universal People's OS.

Never executes payments, sends mail, or writes bookings. The trusted service layer
must authenticate, authorize, obtain consent and execute each step idempotently.
"""
from dataclasses import dataclass
from enum import Enum
from typing import Mapping, Sequence
import re


class Action(str, Enum):
    BOOK = "booking.create"
    MESSAGE = "message.prepare"
    PAYMENT = "payment.prepare"
    CALENDAR = "calendar.check"


@dataclass(frozen=True)
class Step:
    action: Action
    depends_on: tuple[Action, ...] = ()
    requires_confirmation: bool = False


@dataclass(frozen=True)
class Plan:
    intent: str
    steps: tuple[Step, ...]
    needs_clarification: bool


def plan_request(message: str, *, allowed_actions: Sequence[Action]) -> Plan:
    """Return a proposed plan, not authorization to perform it."""
    if not isinstance(message, str) or not message.strip() or len(message) > 4000:
        raise ValueError("Provide a request between 1 and 4000 characters.")
    words = message.casefold()
    wants_booking = bool(re.search(r"\b(boek|boeken|plan|inplannen|afspraak|intake)\b", words))
    wants_message = bool(re.search(r"\b(stuur|mail|bericht|bevestiging)\b", words))
    wants_payment = bool(re.search(r"\b(betaal|betaling|factuur|afrekenen)\b", words))
    wants_calendar = wants_booking or bool(re.search(r"\b(agenda|beschikbaar|beschikbaarheid)\b", words))
    requested = []
    if wants_calendar:
        requested.append(Step(Action.CALENDAR))
    if wants_booking:
        requested.append(Step(Action.BOOK, (Action.CALENDAR,), True))
    if wants_message:
        requested.append(Step(Action.MESSAGE, (Action.BOOK,) if wants_booking else (), True))
    if wants_payment:
        requested.append(Step(Action.PAYMENT, (Action.BOOK,) if wants_booking else (), True))
    permitted = set(allowed_actions)
    # Fail closed: never silently omit a requested action or its dependency.
    required = {step.action for step in requested}
    if not required.issubset(permitted):
        raise PermissionError("One or more requested capabilities are unavailable.")
    if not requested:
        return Plan("unrecognized", (), True)
    return Plan("multi_action" if len(requested) > 1 else "single_action",
                tuple(requested), True)


def validate_execution(plan: Plan, approvals: Mapping[Action, bool],
                       completed: Sequence[Action]) -> tuple[Action, ...]:
    """List only currently eligible steps. No side effects occur here."""
    done = set(completed)
    eligible = []
    for step in plan.steps:
        if step.action in done:
            continue
        if not set(step.depends_on).issubset(done):
            continue
        if step.requires_confirmation and approvals.get(step.action) is not True:
            continue
        eligible.append(step.action)
    return tuple(eligible)
