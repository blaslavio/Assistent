"""Transparent readiness checks for Universal People's OS features.

Never confuse configured dependencies with proven end-to-end production readiness.
"""
from dataclasses import dataclass
from typing import Mapping


@dataclass(frozen=True)
class Readiness:
    name: str
    configured: bool
    integration_tested: bool
    production_verified: bool

    @property
    def ready(self) -> bool:
        return self.configured and self.integration_tested and self.production_verified


def summarize_readiness(checks: Mapping[str, Readiness]) -> dict[str, object]:
    if not checks:
        return {"ready": False, "verified": 0, "total": 0, "missing": ()}
    missing = tuple(key for key, value in checks.items() if not value.ready)
    return {"ready": not missing, "verified": len(checks) - len(missing),
            "total": len(checks), "missing": missing}
