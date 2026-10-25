import unittest
import agenda_import
import agendas

class CalendarFeedbackTests(unittest.TestCase):
    def test_requires_multiple_explicit_ratings(self):
        p = agenda_import.VOORKEUREN
        self.assertEqual(agenda_import.voorkeur_uit_feedback([p[1]]), p[0])
        self.assertEqual(agenda_import.voorkeur_uit_feedback([p[1], p[1]]), p[1])

    def test_provider_capabilities(self):
        modes = agendas.mogelijkheden()
        self.assertTrue(modes["apple"]["schrijven"])
        self.assertFalse(modes["google"]["schrijven"])
        self.assertFalse(modes["outlook"]["schrijven"])

if __name__ == "__main__":
    unittest.main()
