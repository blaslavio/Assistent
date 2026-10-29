"""Pure action lifecycle and retry policy for user-facing operations.

No payment execution or storage. Callers must persist records transactionally and
enforce authorization at the service boundary.
"""
from dataclasses import dataclass, replace
from enum import Enum


class Status(str, Enum):
    PREPARED = "prepared"
    AWAITING_APPROVAL = "awaiting_approval"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    UNKNOWN = "unknown"


ALLOWED = {
    Status.PREPARED: frozenset((Status.AWAITING_APPROVAL, Status.RUNNING)),
    Status.AWAITING_APPROVAL: frozenset((Status.RUNNING,)),
    Status.RUNNING: frozenset((Status.SUCCEEDED, Status.FAILED, Status.UNKNOWN)),
    Status.FAILED: frozenset((Status.RUNNING,)),
    Status.UNKNOWN: frozenset((Status.SUCCEEDED, Status.FAILED)),
    Status.SUCCEEDED: frozenset(),
}


@dataclass(frozen=True)
class ActionState:
    action_id: str
    status: Status = Status.PREPARED
    attempts: int = 0
    requires_approval: bool = False
    approved: bool = False
    retry_safe: bool = False


def transition(action: ActionState, target: Status) -> ActionState:
    if not action.action_id:
        raise ValueError("action_id required")
    if target not in ALLOWED[action.status]:
        raise ValueError("invalid action transition")
    if target == Status.RUNNING:
        if action.requires_approval and not action.approved:
            raise PermissionError("approval required")
        if action.status == Status.FAILED and not action.retry_safe:
            raise PermissionError("retry requires explicit idempotency guarantee")
        return replace(action, status=target, attempts=action.attempts + 1)
    return replace(action, status=target)


def recovery_hint(action: ActionState) -> str:
    if action.status == Status.UNKNOWN:
        return "Controleer eerst de externe status; voer de actie niet opnieuw uit."
    if action.status == Status.FAILED and not action.retry_safe:
        return "Handmatige controle vereist om dubbele uitvoering te voorkomen."
    if action.status == Status.FAILED:
        return "Opnieuw proberen is toegestaan via de beveiligde uitvoeringslaag."
    if action.status == Status.AWAITING_APPROVAL:
        return "Wacht op bevestiging van de gebruiker."
    return ""
