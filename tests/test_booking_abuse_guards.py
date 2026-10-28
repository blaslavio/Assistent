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

    def test_normal_email_addresses_are_accepted(self):
        # Regressie: een te dubbel geëscapete regex weigerde elk adres met een s of een punt.
        from datetime import datetime, timedelta, timezone
        from unittest import mock
        import boekpagina
        import samen
        later = datetime.now(timezone.utc) + timedelta(days=1)
        with mock.patch.object(boekpagina.opslag, "_rpc", return_value={"ok": True}) as rpc:
            for email in ("lisa@x.nl", "sanne.de.vries@gmail.com", "Jan@Example.ORG"):
                boekpagina.boeken("zaak", 0, later, "Lisa", email)
            self.assertEqual(rpc.call_count, 3)
        for fout in ("lisa", "lisa@x", "li sa@x.nl", "a@b@c.nl"):
            with self.assertRaises(samen.Fout):
                boekpagina.boeken("zaak", 0, later, "Lisa", fout)

if __name__ == "__main__":
    unittest.main()
