import ast
from pathlib import Path
import unittest

src = Path("plannen_scherm.py").read_text(encoding="utf-8")
pagina = next(n for n in ast.parse(src).body if isinstance(n, ast.FunctionDef) and n.name == "pagina")
body = ast.get_source_segment(src, pagina)

class PlanningIconsTests(unittest.TestCase):
    def test_all_activity_types_have_material_icons(self):
        # Elke activiteit heeft een Material-icoon (geen emoji) en staat als knop in twee kolommen.
        for item in ("Date", "Speelafspraak", "Uitje", "Etentje", "Verjaardag", "Afspraak"):
            self.assertRegex(body, rf'"{item}",\s*":material/[a-z_]+:"')
        self.assertIn("icon=icoon", body)
        self.assertIn("st.columns(2", body)
        self.assertNotIn('st.pills("Waarvoor?"', body)

if __name__ == "__main__":
    unittest.main()
