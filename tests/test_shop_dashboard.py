import ast
from pathlib import Path
import unittest

source = Path("samen_scherm.py").read_text(encoding="utf-8")

class ShopDashboardTests(unittest.TestCase):
    def test_shop_overview_and_metrics(self):
        fn = next(n for n in ast.parse(source).body if isinstance(n, ast.FunctionDef) and n.name == "mijn_webshop")
        body = ast.get_source_segment(source, fn)
        for part in ('m.get("verkopen")', 'm.get("producten")', 'st.columns(3)', 'Omzet', 'Bestellingen',
                     'st.session_state["_webshop_volgende_deel"] = "Winkel"',
                     'st.session_state["_webshop_volgende_deel"] = "Reserveren"'):
            self.assertIn(part, body)
        self.assertIn("Verkopen via externe winkels tellen niet mee.", body)
        self.assertIn('if deel == "Overzicht":', body)

if __name__ == "__main__":
    unittest.main()
