import ast
from pathlib import Path
import unittest

source = Path("winkelen_scherm.py").read_text(encoding="utf-8")
tree = ast.parse(source)
functions = {n.name: ast.get_source_segment(source, n)
             for n in tree.body if isinstance(n, ast.FunctionDef)}

class ShoppingHubTests(unittest.TestCase):
    def test_distinct_sections(self):
        for label in ("Ontdekken", "Winkels", "Eten bestellen", "Tweedehands", "Producten",
                      "Mandje", "Bestellingen", "Mijn winkel"):
            self.assertIn(label, source)
        self.assertIn('in_de_buurt("restaurant")', functions["pagina"])
        self.assertIn('in_de_buurt("winkel")', functions["pagina"])
        self.assertIn('samen_scherm.zoeken()', functions["pagina"])

    def test_mobile_navigation(self):
        self.assertIn('st.selectbox(', functions["pagina"])
        self.assertIn('_open_onderdeel(doel)', functions["ontdekken"])
        self.assertIn('st.session_state["_winkelen_volgende_deel"] = onderdeel', functions["_open_onderdeel"])
        self.assertIn('st.session_state["winkelen_deel"] = volgend', functions["pagina"])
        self.assertNotIn('st.segmented_control("Winkelen"', functions["pagina"])
        self.assertNotIn("st.session_state.winkelen_deel = doel", functions["ontdekken"])

    def test_no_emojis_in_new_category_icons(self):
        self.assertIn('":material/checkroom:"', functions["ontdekken"])
        self.assertIn('":material/restaurant:"', functions["ontdekken"])

if __name__ == "__main__":
    unittest.main()
