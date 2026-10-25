import unittest
import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
business = ROOT.joinpath("beroep.py").read_text(encoding="utf-8")
screen = ROOT.joinpath("zaak_scherm.py").read_text(encoding="utf-8")

class ProfessionalBusinessTests(unittest.TestCase):
    def test_no_barber_default(self):
        self.assertNotIn('"kapper": (', business)
        self.assertIn('st.selectbox("Kies jouw beroep"', screen)
        self.assertIn('b["soort"] != "kapper"', screen)

    def test_shared_tools_and_extended_sectors(self):
        for key in ('"werkrooster"', '"integraties"', '"omzet"', '"architect"', '"automotive"', '"elektro"', '"retail"'):
            self.assertIn(key, business)
        for label in ("Werkrooster en planning", "Webshop ontwerpen", "Bestaande winkel koppelen", "Omzet en bedrijfsresultaten"):
            self.assertIn(label, screen)

    def test_syntax(self):
        ast.parse(business)
        ast.parse(screen)

if __name__ == "__main__":
    unittest.main()
