"""Tests for release gate, including current blocked evidence."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts import check_release_evidence as gate


class ReleaseGateTests(unittest.TestCase):
    def run_gate(self, data):
        with tempfile.TemporaryDirectory() as directory:
            evidence = Path(directory) / "evidence.json"
            evidence.write_text(json.dumps(data), encoding="utf-8")
            with patch.object(gate, "EVIDENCE", evidence):
                return gate.main()

    def test_missing_fields_fail_closed(self):
        self.assertEqual(self.run_gate({}), 1)

    def test_unconfirmed_live_fails(self):
        self.assertEqual(self.run_gate({"livepublicatie_bevestigd": False}), 1)

    def test_all_required_fields_pass(self):
        self.assertEqual(self.run_gate({
            "livepublicatie_bevestigd": True,
            "production_url": "https://example.com/app",
            "production_e2e_passed": True,
            "supabase_migrations_verified": True,
            "provider_configuration_verified": True,
        }), 0)

    def test_non_https_url_fails(self):
        self.assertEqual(self.run_gate({
            "livepublicatie_bevestigd": True,
            "production_url": "http://example.com",
            "production_e2e_passed": True,
            "supabase_migrations_verified": True,
            "provider_configuration_verified": True,
        }), 1)


if __name__ == "__main__":
    unittest.main()
