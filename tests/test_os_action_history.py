import unittest
from datetime import datetime, timedelta, timezone

from os_action_history import ActionSummary, STATUS_LABELS, recent_actions
from os_action_recovery import Status


class ActionHistoryTests(unittest.TestCase):
    def test_latest_actions_first(self):
        now = datetime(2026, 10, 29, tzinfo=timezone.utc)
        old = ActionSummary("a", "Agenda", Status.SUCCEEDED, now)
        new = ActionSummary("b", "Boeking", Status.UNKNOWN, now + timedelta(minutes=1))
        self.assertEqual(recent_actions((old, new), 1), (new,))
        self.assertEqual(STATUS_LABELS[new.status], "Controle nodig")

    def test_invalid_limits_rejected(self):
        with self.assertRaises(ValueError):
            recent_actions((), 0)

    def test_naive_timestamps_rejected(self):
        item = ActionSummary("x", "Test", Status.PREPARED, datetime(2026, 10, 29))
        with self.assertRaises(ValueError):
            recent_actions((item,))


if __name__ == "__main__":
    unittest.main()
