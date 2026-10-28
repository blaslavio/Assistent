import unittest

from universal_intent import Action, plan_request, validate_execution


ALL = list(Action)


class IntentPlanningTests(unittest.TestCase):
    def test_combined_request_has_dependencies(self):
        p = plan_request("Plan een intake, stuur een bevestiging en regel de betaling", allowed_actions=ALL)
        self.assertEqual([s.action for s in p.steps], [
            Action.CALENDAR, Action.BOOK, Action.MESSAGE, Action.PAYMENT
        ])
        self.assertEqual(validate_execution(p, {}, ()), (Action.CALENDAR,))
        self.assertEqual(validate_execution(p, {Action.BOOK: True}, (Action.CALENDAR,)), (Action.BOOK,))
        self.assertEqual(validate_execution(p, {Action.MESSAGE: True, Action.PAYMENT: True},
                                            (Action.CALENDAR, Action.BOOK)),
                         (Action.MESSAGE, Action.PAYMENT))

    def test_denied_capability_fails_closed(self):
        with self.assertRaises(PermissionError):
            plan_request("Boek intake en stuur bevestiging", allowed_actions=[Action.BOOK, Action.CALENDAR])

    def test_empty_or_long_message_rejected(self):
        for text in ("", " ", "x" * 4001):
            with self.subTest(text=text[:10]):
                with self.assertRaises(ValueError):
                    plan_request(text, allowed_actions=ALL)

    def test_unknown_requires_clarification(self):
        p = plan_request("Goedemorgen", allowed_actions=ALL)
        self.assertTrue(p.needs_clarification)
        self.assertEqual(p.steps, ())

    def test_no_unapproved_side_effect(self):
        p = plan_request("betaling", allowed_actions=ALL)
        self.assertEqual(validate_execution(p, {}, ()), ())
        self.assertEqual(validate_execution(p, {Action.PAYMENT: True}, ()), (Action.PAYMENT,))


if __name__ == "__main__":
    unittest.main()
