import ast
from pathlib import Path
import unittest

source = Path("samen_scherm.py").read_text(encoding="utf-8")
shop = next(n for n in ast.parse(source).body if isinstance(n, ast.FunctionDef) and n.name == "mijn_webshop")
body = ast.get_source_segment(source, shop)

class EmptyStoreTests(unittest.TestCase):
    def test_missing_store_uses_safe_defaults(self):
        self.assertIn('w = m.get("winkel") or {}', body)
        self.assertIn('naam = w.get("naam", "")', body)
        self.assertIn('omschrijving = w.get("omschrijving", "")', body)
        self.assertIn('if not w:', body)
        self.assertIn('if not w:\n        return', body)

if __name__ == "__main__":
    unittest.main()
