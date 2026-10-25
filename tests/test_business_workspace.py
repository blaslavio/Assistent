import ast
from pathlib import Path
import unittest

APP = Path("app.py").read_text(encoding="utf-8")
ZAAK = Path("zaak_scherm.py").read_text(encoding="utf-8")
BEROEP = Path("beroep.py").read_text(encoding="utf-8")


class BusinessWorkspaceTests(unittest.TestCase):
    def test_python_syntax(self):
        for code in (APP, ZAAK, BEROEP):
            ast.parse(code)

    def test_shop_access_precedes_profession(self):
        fn = next(n for n in ast.parse(ZAAK).body if isinstance(n, ast.FunctionDef) and n.name == "beroep_instellingen")
        source = ast.get_source_segment(ZAAK, fn)
        self.assertLess(source.index("Winkelbouwer"), source.index('if not b["soort"]'))
        self.assertIn('"Bestellingen"', source)
        self.assertIn('"Boekingen"', source)
        self.assertIn('"rooster"', source)

    def test_custom_professions_get_shared_tools(self):
        self.assertIn('basis = ["werkrooster", "webshop", "integraties", "omzet", "klanten", "boekhouding"]', BEROEP)
        self.assertIn('"reviews", "diensten", "mail"', BEROEP)
        for sector in ("juridisch", "financieel", "ict", "zorg", "bouw", "onderwijs", "logistiek"):
            self.assertIn('"' + sector + '":', BEROEP)

    def test_settings_label(self):
        self.assertIn("Mijn onderneming", APP)
        self.assertNotIn('("Werk", "Werk", ":material/work:")', APP)


if __name__ == "__main__":
    unittest.main()
