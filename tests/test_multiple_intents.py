import unittest

from intent_engine import parse_intent


class MultipleIntentTests(unittest.TestCase):
    def test_payment_and_appointment_are_not_silently_routed_to_payment(self):
        result = parse_intent("Betaal de factuur en plan een afspraak")
        self.assertEqual(result.kind, "meervoudig")
        self.assertTrue(result.confirmation_required)

    def test_message_and_appointment_are_not_silently_routed_to_message(self):
        result = parse_intent("Verstuur een bericht en plan een afspraak")
        self.assertEqual(result.kind, "meervoudig")

    def test_single_actions_keep_existing_routes(self):
        self.assertEqual(parse_intent("Betaal de factuur").kind, "betaling")
        self.assertEqual(parse_intent("Plan een afspraak").kind, "agenda")
        self.assertEqual(parse_intent("Verstuur een bericht").kind, "communicatie")
