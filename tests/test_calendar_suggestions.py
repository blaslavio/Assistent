import unittest
from datetime import datetime
import agenda_import

class CalendarSuggestionsTests(unittest.TestCase):
    def test_overlap(self):
        existing = [{"titel":"A", "start":"2026-11-02T09:00", "einde":"2026-11-02T10:00"}]
        new = [{"titel":"B", "start":"2026-11-02T09:30", "einde":"2026-11-02T10:30"}]
        self.assertEqual(len(agenda_import.conflicten(new, existing)), 1)
        self.assertEqual(agenda_import.conflicten(
            [{"start":"2026-11-02T10:00","einde":"2026-11-02T10:30"}], existing), [])

    def test_suggestions_skip_busy_slots(self):
        now = datetime(2026, 11, 1, 12)
        busy = [{"start":"2026-11-02T09:00","einde":"2026-11-02T10:00"}]
        slots = agenda_import.voorstellen(busy, limiet=2, nu=now)
        self.assertEqual(len(slots), 2)
        self.assertTrue(all(x.hour >= 10 for x in slots))
        self.assertTrue(all(x.weekday() < 5 for x in slots))

if __name__ == "__main__":
    unittest.main()
