import ast
from pathlib import Path
import unittest

source = Path("app.py").read_text(encoding="utf-8")
tree = ast.parse(source)


class AppSectionsLayoutTests(unittest.TestCase):
    def test_grouped_navigation_retains_links(self):
        fn = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "onderdelen_tegels")
        code = ast.get_source_segment(source, fn)
        self.assertIn('st.page_link(PAGINA[url], width="stretch")', code)
        self.assertIn('st.container(key=f"onderdelen_lijst_{index}")', code)
        self.assertNotIn("width=168", code)
        self.assertNotIn("st.container(border=True", code)


if __name__ == "__main__":
    unittest.main()
