"""Tests for the shared OS action and context foundations."""
import unittest
from decimal import Decimal

from universal_actions import authorize_action, operation_fingerprint
from universal_context import ContextFact, facts_for_subject, simulate_price_change


class CoreFoundationTests(unittest.TestCase):
    def test_confirmation_and_scopes(self):
        with self.assertRaises(PermissionError):
            authorize_action("booking.create", scopes=frozenset({"booking:write"}), confirmed=False)
        with self.assertRaises(PermissionError):
            authorize_action("payment.prepare", scopes=frozenset({"booking:write"}), confirmed=True)
        with self.assertRaises(PermissionError):
            authorize_action("unknown", scopes=frozenset(), confirmed=True)
        self.assertEqual(authorize_action("calendar.check", scopes=frozenset({"calendar:read"}),
                                          confirmed=False).name, "calendar.check")

    def test_fingerprint_is_stable_and_tenant_separated(self):
        args = dict(actor_id="u1", action="booking.create", request_id="r1",
                    payload={"time": "10:00", "date": "2026-11-01"})
        a = operation_fingerprint(tenant_id="t1", **args)
        b = operation_fingerprint(tenant_id="t1", **{**args, "payload": {"date": "2026-11-01", "time": "10:00"}})
        c = operation_fingerprint(tenant_id="t2", **args)
        self.assertEqual(a, b)
        self.assertNotEqual(a, c)

    def test_context_does_not_cross_tenants(self):
        facts = [ContextFact("t1", "u1", "goal", "fitness", "user"),
                 ContextFact("t2", "u1", "goal", "finance", "user")]
        self.assertEqual(len(facts_for_subject(facts, tenant_id="t1", subject_id="u1")), 1)

    def test_scenario_uses_decimal(self):
        result = simulate_price_change(unit_price=Decimal("20"), quantity=10,
                                       change_percent=Decimal("10"))
        self.assertEqual(result.baseline, Decimal("200"))
        self.assertEqual(result.projected, Decimal("220"))
        self.assertEqual(result.delta, Decimal("20"))

    def test_invalid_scenario_rejected(self):
        with self.assertRaises(ValueError):
            simulate_price_change(unit_price=Decimal("NaN"), quantity=1,
                                  change_percent=Decimal("10"))


if __name__ == "__main__":
    unittest.main()
