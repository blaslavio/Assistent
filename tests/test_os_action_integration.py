import unittest

from os_action_integration import PlannedAction, eligible_actions, start_eligible
from os_action_recovery import ActionState, Status


class ActionIntegrationTests(unittest.TestCase):
    def test_booking_requires_calendar_and_approval(self):
        steps = (PlannedAction("calendar", requires_approval=False),
                 PlannedAction("booking", ("calendar",)))
        states = {"calendar": ActionState("calendar"),
                  "booking": ActionState("booking", approved=True, requires_approval=True)}
        self.assertEqual(eligible_actions(steps, states), ("calendar",))
        states["calendar"] = ActionState("calendar", Status.SUCCEEDED)
        self.assertEqual(eligible_actions(steps, states), ("booking",))
        self.assertEqual(start_eligible(steps[1], states, steps).status, Status.RUNNING)

    def test_missing_approval_blocks(self):
        steps = (PlannedAction("payment"),)
        states = {"payment": ActionState("payment", requires_approval=True)}
        self.assertEqual(eligible_actions(steps, states), ())

    def test_invalid_dependencies_rejected(self):
        with self.assertRaises(ValueError):
            eligible_actions((PlannedAction("booking", ("unknown",)),), {})

    def test_duplicate_steps_rejected(self):
        with self.assertRaises(ValueError):
            eligible_actions((PlannedAction("x"), PlannedAction("x")), {})


if __name__ == "__main__":
    unittest.main()
