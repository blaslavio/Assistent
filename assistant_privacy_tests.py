import unittest
from assistant_privacy import SCOPES, normalized_consents, set_consent, can_learn, learn_scoped, forget_scope


class ScopedPrivacyTests(unittest.TestCase):
    def test_every_module_opted_out(self):
        self.assertTrue(all(not value for value in normalized_consents({}).values()))

    def test_unknown_scope_denied(self):
        self.assertFalse(can_learn({}, "payments"))
        with self.assertRaises(ValueError):
            set_consent({}, "payments", True)

    def test_no_learning_without_consent(self):
        self.assertEqual(learn_scoped({}, {}, "agenda", "afspraak morgen"), {})

    def test_isolation(self):
        values = set_consent({}, "agenda", True)
        patterns = learn_scoped({}, values, "agenda", "afspraak morgen")
        self.assertEqual(patterns["agenda"]["planning"], 1)
        self.assertNotIn("assistent", patterns)

    def test_forget(self):
        self.assertEqual(forget_scope({"agenda": {"planning": 1}}, "agenda"), {})


if __name__ == "__main__":
    unittest.main()
