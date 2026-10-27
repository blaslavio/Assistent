"""Central opt-in privacy policy for assistant learning and cross-module suggestions.

No raw message content is retained by this component. Callers must authenticate
users and enforce resource permissions separately.
"""
from dataclasses import dataclass

SCOPES = ("assistent", "agenda", "mail", "diensten", "community")
DEFAULT_CONSENT = {scope: False for scope in SCOPES}


@dataclass(frozen=True)
class PrivacyChoice:
    scope: str
    enabled: bool


def normalized_consents(values: dict | None) -> dict[str, bool]:
    values = values or {}
    return {scope: values.get(scope) is True for scope in SCOPES}


def set_consent(values: dict | None, scope: str, enabled: bool) -> dict[str, bool]:
    if scope not in SCOPES or not isinstance(enabled, bool):
        raise ValueError("Unknown scope or invalid consent")
    return {**normalized_consents(values), scope: enabled}


def can_learn(values: dict | None, scope: str) -> bool:
    if scope not in SCOPES:
        return False
    return normalized_consents(values)[scope]


def forget_scope(patterns: dict | None, scope: str) -> dict:
    if scope not in SCOPES:
        raise ValueError("Unknown scope")
    result = dict(patterns or {})
    result.pop(scope, None)
    return result


def learn_scoped(patterns: dict | None, consents: dict | None,
                 scope: str, text: str) -> dict:
    from assistant_learning import update_patterns
    if scope not in SCOPES:
        raise ValueError("Unknown scope")
    result = dict(patterns or {})
    if can_learn(consents, scope):
        result[scope] = update_patterns(result.get(scope, {}), text, consent=True)
    return result
