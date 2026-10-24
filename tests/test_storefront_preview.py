import ast
from pathlib import Path
import unittest

source = Path('samen_scherm.py').read_text(encoding='utf-8')

class StorefrontPreviewTests(unittest.TestCase):
    def test_preview_and_share(self):
        fn = next(n for n in ast.parse(source).body if isinstance(n, ast.FunctionDef) and n.name == 'mijn_webshop')
        code = ast.get_source_segment(source, fn)
        self.assertIn('winkel_link(w["adres"])', code)
        self.assertIn('html.escape(', code)
        self.assertIn('plannen_scherm.zaak_beheer()', code)

if __name__ == '__main__':
    unittest.main()
