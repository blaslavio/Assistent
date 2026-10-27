import ast
from pathlib import Path
import unittest

book = Path("boekpagina.py").read_text(encoding="utf-8")
ui = Path("plannen_scherm.py").read_text(encoding="utf-8")

class BookingGuardTests(unittest.TestCase):
    def test_public_booking_validation(self):
        fn = next(n for n in ast.parse(book).body if isinstance(n, ast.FunctionDef) and n.name == "boeken")
        src = ast.get_source_segment(book, fn)
        for phrase in ("naam.strip()", "email.strip().lower()", "re.fullmatch(", "start <= datetime.now(", 'opslag._rpc("boeken"'):
            self.assertIn(phrase, src)

    def test_calendar_sync_still_active(self):
        self.assertIn('if b["status"] == "bevestigd" and not afspraak_id:', book)
        self.assertIn('opslag.afspraak_verwijderen(int(afspraak_id))', book)

    def test_public_form_bot_barriers(self):
        fn = next(n for n in ast.parse(ui).body if isinstance(n, ast.FunctionDef) and n.name == "boek_pagina")
        src = ast.get_source_segment(ui, fn)
        self.assertIn('key="boek_website"', src)
        self.assertIn('if website.strip():', src)
        self.assertIn('if wachttijd > 0:', src)
        self.assertIn('st.session_state["_boek_laatste_poging"]', src)

if __name__ == "__main__":
    unittest.main()
