import gzip
import unittest
from decimal import Decimal
from action_tools import parse_offer, compress_file
from intent_engine import parse_intent

class ActionToolsTests(unittest.TestCase):
    def test_price_is_not_duration(self):
        offer = parse_offer("Maak link voor PT 24 uur voor 50 euro")
        self.assertEqual(offer.price, Decimal("50"))
        self.assertEqual(offer.hours, 24)
    def test_no_invented_price(self):
        self.assertIsNone(parse_offer("Maak link voor PT voor 24 uur").price)
    def test_decimal_and_plural_days(self):
        offer = parse_offer("Maak link voor PT voor € 45,50 voor 2 dagen")
        self.assertEqual((offer.price, offer.hours), (Decimal("45.50"), 48))
    def test_general_trainer_question_is_not_offer(self):
        self.assertIsNone(parse_offer("Welke trainer is beschikbaar?"))
    def test_lossless_download(self):
        original = b"training" * 1000
        name, data, _ = compress_file("../../training.txt", original)
        self.assertEqual(name, "training.txt.gz")
        self.assertEqual(gzip.decompress(data), original)
    def test_no_fake_compression(self):
        self.assertEqual(compress_file("kort.txt", b"x")[:2], ("kort.txt", b"x"))
    def test_intent_routes_offer_as_draft(self):
        self.assertEqual(parse_intent("Maak link voor PT 50 euro voor 24 uur").kind, "actielink")
