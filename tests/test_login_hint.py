import ast
from pathlib import Path
import unittest

source = Path("app.py").read_text(encoding="utf-8")

class LoginHintTests(unittest.TestCase):
    def test_login_hides_enter_hint(self):
        fn = next(node for node in ast.parse(source).body
                  if isinstance(node, ast.FunctionDef) and node.name == "inlogformulier")
        code = ast.get_source_segment(source, fn)
        self.assertIn('data-testid="InputInstructions"', code)
        self.assertIn('display: none !important;', code)
        self.assertLess(code.index('st.html('), code.index('with st.form("inloggen")'))

if __name__ == "__main__":
    unittest.main()
