import unittest
from decimal import Decimal
from escrow_safety import parse_amount, prepare_escrow_proposal, assert_transition


class EscrowSafetyTests(unittest.TestCase):
    def test_decimal_comma(self):
        self.assertEqual(parse_amount("€ 30,50"), Decimal("30.50"))

    def test_fee_rounding(self):
        proposal = prepare_escrow_proposal("Coaching", "0.30")
        self.assertEqual(proposal.fee, Decimal("0.02"))
        self.assertEqual(proposal.net, Decimal("0.28"))

    def test_reject_ambiguous_amount(self):
        with self.assertRaises(ValueError):
            parse_amount("30 en 40 euro")

    def test_reject_excess_precision(self):
        with self.assertRaises(ValueError):
            parse_amount("12.345")

    def test_reject_zero(self):
        with self.assertRaises(ValueError):
            parse_amount("0")

    def test_reject_oversized_amount(self):
        with self.assertRaises(ValueError):
            parse_amount("1000001")

    def test_reject_unauthorized_transition(self):
        with self.assertRaises(PermissionError):
            assert_transition("held", "refunded", authorized=False, provider_confirmed=True)

    def test_reject_unconfirmed_provider(self):
        with self.assertRaises(PermissionError):
            assert_transition("pending", "held", authorized=True, provider_confirmed=False)

    def test_reject_repeat_transition(self):
        with self.assertRaises(ValueError):
            assert_transition("released", "released", authorized=True, provider_confirmed=True)

    def test_allow_confirmed_authorized_transition(self):
        self.assertIsNone(assert_transition("held", "released", authorized=True, provider_confirmed=True))


if __name__ == "__main__":
    unittest.main()
