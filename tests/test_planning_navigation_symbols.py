from pathlib import Path
import unittest

class PlanningSymbolsTests(unittest.TestCase):
    def test_planning_symbols_and_clear_sections(self):
        s = Path("plannen_scherm.py").read_text(encoding="utf-8")
        self.assertIn('st.subheader("Nieuwe activiteit")', s)
        self.assertIn('st.markdown("**Details van de activiteit**")', s)
        self.assertIn('":material/event:"', s)
        self.assertIn('":material/restaurant:"', s)
        self.assertIn('format_func=lambda naam:', s)

    def test_agenda_navigation_icons(self):
        s = Path("app.py").read_text(encoding="utf-8")
        self.assertIn('agenda_iconen = {', s)
        self.assertIn('":material/calendar_month:"', s)
        self.assertIn('":material/event_available:"', s)

if __name__ == "__main__":
    unittest.main()
