import ast
from pathlib import Path
import unittest

src = Path("zaak_scherm.py").read_text(encoding="utf-8")
fn = next(n for n in ast.parse(src).body if isinstance(n, ast.FunctionDef) and n.name == "beroep_instellingen")
body = ast.get_source_segment(src, fn)

class BusinessToolRowsTests(unittest.TestCase):
    def test_all_six_tools_have_routes(self):
        for title in ("Werkrooster en planning", "Webshop bouwen",
                      "Bestaande webshop koppelen", "Omzet en verkoopresultaten",
                      "Klanten en saldo", "Boekhouding en btw"):
            self.assertIn(title, body)
        for route in ('"zakelijk", "werkrooster"', '"webshop", "webshop"',
                      '"instellingen", "integraties"', '"zakelijk", "omzet"',
                      '"zakelijk", "klanten"', '"zakelijk", "boekhouding"'):
            self.assertIn(route, body)
        self.assertIn('_openen(url, tool)', body)
        self.assertIn('st.rerun()', body)

    def test_help_and_alignment(self):
        self.assertIn('st.popover("Uitleg"', body)
        self.assertIn('text-align:left!important', body)
        self.assertIn('st.columns([3, 1.6, 1.5]', body)

if __name__ == "__main__":
    unittest.main()
