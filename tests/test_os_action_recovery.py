import unittest
from dataclasses import replace

from os_action_recovery import ActionState, Status, recovery_hint, transition


class ActionRecoveryTests(unittest.TestCase):
    def test_approval_required_before_execution(self):
        state = ActionState("booking-1", Status.AWAITING_APPROVAL, requires_approval=True)
        with self.assertRaises(PermissionError):
            transition(state, Status.RUNNING)
        self.assertEqual(transition(replace(state, approved=True), Status.RUNNING).attempts, 1)

    def test_unknown_result_cannot_be_retried(self):
        state = ActionState("payment-1", Status.UNKNOWN, attempts=1)
        with self.assertRaises(ValueError):
            transition(state, Status.RUNNING)
        self.assertIn("niet opnieuw", recovery_hint(state))

    def test_retry_requires_idempotency_guarantee(self):
        failed = ActionState("payment-2", Status.FAILED, attempts=1)
        with self.assertRaises(PermissionError):
            transition(failed, Status.RUNNING)
        safe = transition(replace(failed, retry_safe=True), Status.RUNNING)
        self.assertEqual(safe.attempts, 2)

    def test_completed_action_cannot_restart(self):
        with self.assertRaises(ValueError):
            transition(ActionState("done", Status.SUCCEEDED), Status.RUNNING)


if __name__ == "__main__":
    unittest.main()
