import ast
from pathlib import Path
import unittest

source = Path("winkelen_scherm.py").read_text(encoding="utf-8")
functions = {n.name: ast.get_source_segment(source, n)
             for n in ast.parse(source).body if isinstance(n, ast.FunctionDef)}

class ShoppingNavigationTests(unittest.TestCase):
    def test_navigation_is_deferred(self):
        self.assertIn('st.session_state["_winkelen_volgende_deel"] = onderdeel', functions["_open_onderdeel"])
        self.assertIn('st.session_state.pop("_winkelen_volgende_deel", None)', functions["pagina"])
        self.assertIn('st.session_state["winkelen_deel"] = volgend', functions["pagina"])
        self.assertIn('key="winkelen_deel"', functions["pagina"])
        self.assertIn('_open_onderdeel(doel)', functions["ontdekken"])
        self.assertNotIn('st.session_state.winkelen_deel = doel', functions["ontdekken"])

    def test_all_buyer_categories_visible(self):
        self.assertIn('if d != "winkel"', functions["pagina"])
        for section in ("winkels", "eten", "tweedehands", "producten", "mandje", "bestellingen"):
            self.assertIn(f'"{section}"', source)

if __name__ == "__main__":
    unittest.main()
