"""Privacy controls and user-report workflow for public community content.

No server-side inspection of end-to-end encrypted private messages.
All operations require the caller to authenticate and authorize access.
"""
from dataclasses import dataclass
from enum import Enum
from uuid import uuid4


class ReportReason(str, Enum):
    THREAT = "threat"
    RACISM = "racism"
    HARASSMENT = "harassment"
    PRIVACY = "privacy"
    OTHER = "other"


@dataclass(frozen=True)
class Report:
    id: str
    reporter_id: str
    content_id: str
    reason: ReportReason
    note: str
    status: str = "pending_review"


def prepare_report(reporter_id: str, content_id: str, reason: str, note: str = "") -> Report:
    """Return a review request; persistence and access control belong to the API layer."""
    if not reporter_id.strip() or not content_id.strip():
        raise PermissionError("Authenticated reporter and content ID are required.")
    if len(content_id) > 128 or len(note) > 1000:
        raise ValueError("Report fields exceed size limits.")
    return Report(uuid4().hex, reporter_id.strip(), content_id.strip(),
                  ReportReason(reason), note.strip())


PRIVACY_DEFAULTS = {
    "public_profile": False,
    "allow_discovery": False,
    "personalized_recommendations": False,
    "analytics_opt_in": False,
    "marketing_opt_in": False,
    "private_messages_server_scanning": False,
}


def update_privacy_preferences(current: dict, changes: dict) -> dict:
    """Allow only explicit boolean privacy choices; never silently opt users in."""
    if any(key not in PRIVACY_DEFAULTS for key in changes):
        raise ValueError("Unknown privacy setting.")
    if any(not isinstance(value, bool) for value in changes.values()):
        raise ValueError("Privacy preferences must be booleans.")
    if changes.get("private_messages_server_scanning") is True:
        raise ValueError("Encrypted private message scanning is not supported.")
    return {**PRIVACY_DEFAULTS, **current, **changes}


def prepare_data_request(user_id: str, kind: str) -> dict:
    """Create a request for an authenticated backend to process, not an instant deletion."""
    if not user_id.strip():
        raise PermissionError("Login required.")
    if kind not in ("export", "delete"):
        raise ValueError("Unsupported request.")
    return {"id": uuid4().hex, "user_id": user_id.strip(),
            "kind": kind, "status": "pending_identity_verification"}
