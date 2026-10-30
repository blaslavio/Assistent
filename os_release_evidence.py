"""Release evidence gate: require current, explicit proof for critical workflows.

No external calls. No secrets. A passing unit test never implies a live service works.
"""
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta


CRITICAL_WORKFLOWS = ("auth", "chat", "agenda", "booking", "payments", "mail")


@dataclass(frozen=True)
class Evidence:
    workflow: str
    kind: str
    passed: bool
    observed_at: datetime
    commit_sha: str
    environment: str


def release_gate(evidence: tuple[Evidence, ...], *, commit_sha: str,
                 now: datetime, max_age_hours: int = 24) -> dict[str, object]:
    if now.tzinfo is None or now.utcoffset() is None:
        raise ValueError("now must be timezone-aware")
    if max_age_hours <= 0:
        raise ValueError("max_age_hours must be positive")
    if not commit_sha:
        raise ValueError("commit_sha is required")
    latest: dict[str, Evidence] = {}
    for item in evidence:
        if item.workflow not in CRITICAL_WORKFLOWS:
            continue
        if item.observed_at.tzinfo is None or item.observed_at.utcoffset() is None:
            continue
        age = now - item.observed_at
        if (item.kind == "e2e" and item.environment == "production"
                and item.commit_sha == commit_sha
                and timedelta(0) <= age <= timedelta(hours=max_age_hours)):
            previous = latest.get(item.workflow)
            # The newest result wins; a failure wins equal timestamps.
            if (previous is None or item.observed_at > previous.observed_at
                    or (item.observed_at == previous.observed_at and item.passed is not True)):
                latest[item.workflow] = item
    covered = {name for name, item in latest.items() if item.passed is True}
    missing = tuple(name for name in CRITICAL_WORKFLOWS if name not in covered)
    return {"ready": not missing, "verified": len(covered),
            "total": len(CRITICAL_WORKFLOWS), "missing": missing}
