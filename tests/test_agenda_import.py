import unittest
from datetime import datetime
import agenda_import

class CalendarImportTests(unittest.TestCase):
    def test_parse_and_dedupe(self):
        raw = (b"BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\n"
               b"SUMMARY:Training\r\nDTSTART:20261103T180000\r\n"
               b"DTEND:20261103T190000\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n")
        result = agenda_import.lezen(raw)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["start"], "2026-11-03T18:00")
        self.assertEqual(len(agenda_import.uniek(result, result)), 0)
        self.assertEqual(len(agenda_import.uniek(result + result, [])), 1)

    def test_invalid_file(self):
        with self.assertRaises(ValueError):
            agenda_import.lezen(b"hello")
        with self.assertRaises(ValueError):
            agenda_import.lezen(b"x" * (agenda_import.MAX_BYTES + 1))

    def test_recurring_not_silently_expanded(self):
        raw = (b"BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:Weekly\n"
               b"DTSTART:20261103T180000\nRRULE:FREQ=WEEKLY\n"
               b"END:VEVENT\nEND:VCALENDAR")
        self.assertEqual(agenda_import.lezen(raw), [])

if __name__ == "__main__":
    unittest.main()
