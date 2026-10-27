import ast
from pathlib import Path
import unittest

source = Path("app.py").read_text(encoding="utf-8")

class PrivateSessionCacheTests(unittest.TestCase):
    def test_private_cache_is_not_global(self):
        tree = ast.parse(source)
        functions = {n.name: n for n in tree.body if isinstance(n, ast.FunctionDef)}
        for name in ("_media_inhoud", "_mails", "_mail"):
            fn = functions[name]
            self.assertFalse(any(isinstance(d, ast.Call) and isinstance(d.func, ast.Attribute)
                                 and d.func.attr == "cache_data" for d in fn.decorator_list))
            self.assertIn("_privé_cache(", ast.get_source_segment(source, fn))
        helper = ast.get_source_segment(source, functions["_privé_cache"])
        self.assertIn("st.session_state", helper)
        self.assertIn('cache.clear()', helper)
        self.assertIn('max_items: int = 40', helper)
        self.assertIn('time.monotonic()', helper)

    def test_manual_refresh(self):
        self.assertIn('st.session_state.pop("_privé_cache", None)', source)

if __name__ == "__main__":
    unittest.main()
