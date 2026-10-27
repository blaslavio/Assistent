import ast
from pathlib import Path
import unittest

source = Path("samen_scherm.py").read_text(encoding="utf-8")
functions = {n.name: ast.get_source_segment(source, n)
             for n in ast.parse(source).body if isinstance(n, ast.FunctionDef)}

class StorefrontSecondhandTests(unittest.TestCase):
    def test_store_sections(self):
        shop = functions["mijn_webshop"]
        for name in ("Producten", "Tweedehands", "Bestellingen", "Reserveren", "Winkel"):
            self.assertIn(f'"{name}"', shop)
        self.assertIn('winkel_producten_beheren(m)', shop)
        self.assertIn('tweedehands_aanbieden()', shop)
        self.assertIn('bestellingen()', shop)
        self.assertIn('icon=icoon', shop)

    def test_secondhand_uses_existing_marketplace(self):
        listing = functions["tweedehands_aanbieden"]
        for text in ("Categorie", "Merk", "Maat", "Staat", "Gebreken", "Vraagprijs",
                     "samen.aanbod_plaatsen", '"product"', "akkoord"):
            self.assertIn(text, listing)
        self.assertIn('st.form("tweedehands_kleding"', listing)

    def test_products_not_embedded_in_shop_designer(self):
        self.assertIn("def winkel_producten_beheren(", source)
        self.assertIn('st.markdown("**Producten in je winkel**")',
                      functions["winkel_producten_beheren"])

if __name__ == "__main__":
    unittest.main()
