import ast
from pathlib import Path
import unittest

src = Path("plannen_scherm.py").read_text(encoding="utf-8")
pagina = next(n for n in ast.parse(src).body if isinstance(n, ast.FunctionDef) and n.name == "pagina")
body = ast.get_source_segment(src, pagina)

class PlanningIconsTests(unittest.TestCase):
    def test_all_activity_types_have_material_icons(self):
        for item in ("Date", "Speelafspraak", "Uitje", "Etentje", "Verjaardag", "Afspraak"):
            self.assertIn(f'"{item}": ":material/', body)
        self.assertIn('st.button(activiteit, icon=iconen.get(', body)
        self.assertIn('st.columns(2)', body)
        self.assertNotIn('st.pills("Waarvoor?"', body)

if __name__ == "__main__":
    unittest.main()
