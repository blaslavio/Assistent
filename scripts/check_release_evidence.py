#!/usr/bin/env python3
"""Fail-closed release evidence gate. Run before production publication."""
import json
import os
import sys
from pathlib import Path

EVIDENCE = Path(__file__).resolve().parents[1] / "controle" / "zachte_start.json"

def main():
    errors = []
    try:
        data = json.loads(EVIDENCE.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        print(f"BLOCKED: release evidence unreadable: {exc}", file=sys.stderr)
        return 1
    if data.get("livepublicatie_bevestigd") is not True:
        errors.append("livepublicatie_bevestigd is not true")
    for key in ("production_url", "production_e2e_passed", "supabase_migrations_verified", "provider_configuration_verified"):
        value = data.get(key)
        if key == "production_url":
            if not isinstance(value, str) or not value.startswith("https://"):
                errors.append("production_url must be a verified HTTPS URL")
        elif value is not True:
            errors.append(f"{key} is not true")
    if errors:
        print("BLOCKED: production release not verified:\n- " + "\n- ".join(errors), file=sys.stderr)
        return 1
    print("Release evidence fields present; independently validate the supplied evidence before deployment.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
