import ast
from pathlib import Path
import unittest

source = Path("samen_scherm.py").read_text(encoding="utf-8")
functions = {n.name: ast.get_source_segment(source, n) for n in ast.parse(source).body
             if isinstance(n, ast.FunctionDef)}


class ShopBuilderProductTests(unittest.TestCase):
    def test_real_product_backend(self):
        code = functions["webshop_product_toevoegen"]
        for name in ("Productnaam", "Productomschrijving", "Verkoopprijs", "Aantal op voorraad",
                     "samen.aanbod_plaatsen", "samen.winkel_product", "st.form_submit_button"):
            self.assertIn(name, code)
        self.assertIn("if not w:", code)

    def test_product_section_opens_creation_and_inventory(self):
        code = functions["mijn_webshop"]
        self.assertIn("webshop_product_toevoegen(w)", code)
        self.assertIn("winkel_producten_beheren(m)", code)
        self.assertIn("Kortingen en promoties", code)
        self.assertIn("Voorbeeld van je winkelpagina", code)

if __name__ == "__main__":
    unittest.main()
