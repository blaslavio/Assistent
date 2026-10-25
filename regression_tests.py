import unittest
from pay_in_chat_core import create_draft, verified_payment_status, PaymentStatus
from workspace_hub import classify_command, Intent

class RegressionTests(unittest.TestCase):
    def test_amount(self):
        self.assertEqual(create_draft("Training", "75.25").amount_cents, 7525)
    def test_no_fake_payment(self):
        with self.assertRaises(PermissionError):
            verified_payment_status(provider_verified=False, provider_status="paid", provider_reference="x", expected_reference="x", amount_cents=100, expected_amount_cents=100)
    def test_command_requires_confirmation(self):
        result = classify_command("Maak een betaalverzoek", "zakelijk")
        self.assertEqual(result.intent, Intent.PAYMENT)
        self.assertTrue(result.requires_confirmation)

if __name__ == "__main__":
    unittest.main()
