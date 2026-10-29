import unittest

from os_readiness import Readiness, summarize_readiness


class ReadinessTests(unittest.TestCase):
    def test_configuration_alone_does_not_claim_live(self):
        result = summarize_readiness({"stripe": Readiness("Stripe", True, False, False)})
        self.assertFalse(result["ready"])
        self.assertEqual(result["missing"], ("stripe",))

    def test_all_gates_required(self):
        result = summarize_readiness({"agenda": Readiness("Agenda", True, True, True)})
        self.assertTrue(result["ready"])
        self.assertEqual(result["verified"], 1)

    def test_empty_checks_are_not_ready(self):
        self.assertFalse(summarize_readiness({})["ready"])


if __name__ == "__main__":
    unittest.main()
