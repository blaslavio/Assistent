"""Present action history consistently without exposing sensitive payloads."""
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable

from os_action_recovery import Status


@dataclass(frozen=True)
class ActionSummary:
    action_id: str
    title: str
    status: Status
    updated_at: datetime


def recent_actions(actions: Iterable[ActionSummary], limit: int = 10) -> tuple[ActionSummary, ...]:
    if not 1 <= limit <= 100:
        raise ValueError("limit must be between 1 and 100")
    items = tuple(actions)
    if any(item.updated_at.tzinfo is None or item.updated_at.utcoffset() is None for item in items):
        raise ValueError("timestamps must be timezone-aware")
    return tuple(sorted(items, key=lambda item: (item.updated_at, item.action_id), reverse=True)[:limit])


STATUS_LABELS = {
    Status.PREPARED: "Voorbereid",
    Status.AWAITING_APPROVAL: "Wacht op goedkeuring",
    Status.RUNNING: "Bezig",
    Status.SUCCEEDED: "Afgerond",
    Status.FAILED: "Mislukt",
    Status.UNKNOWN: "Controle nodig",
}
