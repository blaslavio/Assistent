import ast
from pathlib import Path
import unittest

source = Path("winkelen_scherm.py").read_text(encoding="utf-8")
functions = {node.name: ast.get_source_segment(source, node)
             for node in ast.parse(source).body if isinstance(node, ast.FunctionDef)}

class ShoppingPolishTests(unittest.TestCase):
    def test_deferred_widget_state_before_selectbox(self):
        page = functions["pagina"]
        self.assertLess(page.index('st.session_state["winkelen_deel"] = volgend'),
                        page.index('st.selectbox('))
        self.assertNotIn('st.session_state.winkelen_deel = doel', functions["ontdekken"])
        self.assertIn('_open_onderdeel(doel)', functions["ontdekken"])

    def test_left_aligned_categories_and_explanations(self):
        discover = functions["ontdekken"]
        self.assertIn("justify-content: flex-start", discover)
        self.assertIn("text-align: left", discover)
        for section in ("Winkels", "Eten bestellen", "Tweedehands", "Producten",
                        "Winkelmandje bekijken", "Bestellingen bekijken"):
            self.assertIn(section, discover)
        self.assertIn("help=uitleg", discover)

    def test_no_results_are_explained(self):
        self.assertIn("Stel je plaats in", functions["producten"])
        self.assertIn("Geen producten gevonden", functions["producten"])
        self.assertIn("Er zijn hier nog geen aanbieders gevonden", functions["in_de_buurt"])

if __name__ == "__main__":
    unittest.main()
