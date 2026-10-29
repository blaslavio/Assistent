import unittest
from datetime import datetime, timedelta, timezone

from os_release_evidence import CRITICAL_WORKFLOWS, Evidence, release_gate


class ReleaseEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 10, 29, 9, tzinfo=timezone.utc)

    def evidence(self, workflow, **overrides):
        fields = dict(workflow=workflow, kind="e2e", passed=True,
                      observed_at=self.now, commit_sha="abc", environment="production")
        fields.update(overrides)
        return Evidence(**fields)

    def test_missing_proof_blocks_release(self):
        self.assertFalse(release_gate((), commit_sha="abc", now=self.now)["ready"])

    def test_all_workflows_need_live_proof(self):
        items = tuple(self.evidence(w) for w in CRITICAL_WORKFLOWS)
        self.assertTrue(release_gate(items, commit_sha="abc", now=self.now)["ready"])

    def test_unit_tests_cannot_substitute_e2e(self):
        items = tuple(self.evidence(w, kind="unit") for w in CRITICAL_WORKFLOWS)
        self.assertEqual(release_gate(items, commit_sha="abc", now=self.now)["verified"], 0)

    def test_stale_or_other_commit_is_rejected(self):
        items = (self.evidence("auth", observed_at=self.now - timedelta(days=2)),
                 self.evidence("chat", commit_sha="old"))
        self.assertEqual(release_gate(items, commit_sha="abc", now=self.now)["verified"], 0)

    def test_future_and_staging_proof_are_rejected(self):
        items = (self.evidence("auth", observed_at=self.now + timedelta(minutes=1)),
                 self.evidence("chat", environment="staging"))
        self.assertEqual(release_gate(items, commit_sha="abc", now=self.now)["verified"], 0)


if __name__ == "__main__":
    unittest.main()
