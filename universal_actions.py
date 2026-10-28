"""Shared action contracts for OS modules; no external side effects.

Adapters must validate identity, tenant scope and capability grants at execution time.
"""
from dataclasses import dataclass
from enum import Enum
from typing import Mapping, Any
import hashlib
import json


class Risk(str, Enum):
    READ = "read"
    WRITE = "write"
    FINANCIAL = "financial"


@dataclass(frozen=True)
class ActionContract:
    name: str
    risk: Risk
    required_scopes: frozenset[str]
    confirmation_required: bool = True


CONTRACTS: Mapping[str, ActionContract] = {
    "calendar.check": ActionContract("calendar.check", Risk.READ, frozenset({"calendar:read"}), False),
    "booking.create": ActionContract("booking.create", Risk.WRITE, frozenset({"booking:write"})),
    "message.prepare": ActionContract("message.prepare", Risk.WRITE, frozenset({"message:prepare"})),
    "payment.prepare": ActionContract("payment.prepare", Risk.FINANCIAL, frozenset({"payment:prepare"})),
}


def authorize_action(name: str, *, scopes: frozenset[str], confirmed: bool) -> ActionContract:
    """Fail closed on unknown actions, missing grants or missing consent."""
    contract = CONTRACTS.get(name)
    if contract is None:
        raise PermissionError("Unknown action")
    if not contract.required_scopes.issubset(scopes):
        raise PermissionError("Missing action scope")
    if contract.confirmation_required and not confirmed:
        raise PermissionError("Explicit confirmation required")
    return contract


def operation_fingerprint(*, tenant_id: str, actor_id: str, action: str,
                          payload: Mapping[str, Any], request_id: str) -> str:
    """Stable request fingerprint; not a replacement for DB uniqueness constraints."""
    if not all(isinstance(x, str) and x.strip() for x in (tenant_id, actor_id, action, request_id)):
        raise ValueError("Identifiers must be nonempty strings")
    if action not in CONTRACTS:
        raise ValueError("Unknown action")
    encoded = json.dumps([tenant_id, actor_id, action, request_id, payload],
                         sort_keys=True, separators=(",", ":"), allow_nan=False)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()
