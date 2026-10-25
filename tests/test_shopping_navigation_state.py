import ast
from pathlib import Path
import unittest

source = Path("winkelen_scherm.py").read_text(encoding="utf-8")
shop_source = Path("samen_scherm.py").read_text(encoding="utf-8")
functions = {n.name: ast.get_source_segment(source, n)
             for n in ast.parse(source).body if isinstance(n, ast.FunctionDef)}

class ShoppingNavigationTests(unittest.TestCase):
    """Regressie: selectbox-state wijzigen vóór het renderen van de widget."""
    def test_shop_dashboard_deferred_navigation(self):
        self.assertIn('st.session_state.pop("_webshop_volgende_deel", None)', shop_source)
        self.assertIn('st.session_state["_webshop_volgende_deel"] = bestemming', shop_source)
        self.assertNotIn('st.session_state.webshop_deel = bestemming', shop_source)
        self.assertIn('key="webshop_deel"', shop_source)

    def test_navigation_is_deferred(self):
        self.assertIn('st.session_state["_winkelen_volgende_deel"] = onderdeel', functions["_open_onderdeel"])
        self.assertIn('st.session_state.pop("_winkelen_volgende_deel", None)', functions["pagina"])
        self.assertIn('st.session_state["winkelen_deel"] = volgend', functions["pagina"])
        self.assertIn('key="winkelen_deel"', functions["pagina"])
        self.assertIn('_open_onderdeel(doel)', functions["ontdekken"])
        self.assertNotIn('st.session_state.winkelen_deel = doel', functions["ontdekken"])

    def test_left_aligned_discovery_cards(self):
        self.assertIn('with st.container(border=True):', functions["ontdekken"])
        self.assertIn('st.caption(uitleg)', functions["ontdekken"])
        self.assertIn('icon=":material/arrow_forward:"', functions["ontdekken"])

    def test_all_buyer_categories_visible(self):
        self.assertIn('if d != "winkel"', functions["pagina"])
        for section in ("winkels", "eten", "tweedehands", "producten", "mandje", "bestellingen"):
            self.assertIn(f'"{section}"', source)

if __name__ == "__main__":
    unittest.main()
