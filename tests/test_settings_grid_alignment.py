import ast
from pathlib import Path
import unittest

source = Path("app.py").read_text(encoding="utf-8")


class SettingsGridAlignmentTests(unittest.TestCase):
    def test_grid_has_explicit_icon_and_label_columns(self):
        node = next(n for n in ast.parse(source).body if isinstance(n, ast.FunctionDef) and n.name == "instellingen_tabblad")
        code = ast.get_source_segment(source, node)
        for rule in ('display: flex !important;', 'flex-direction: row !important;',
                     'flex: 0 0 auto !important;', 'flex: 1 1 auto !important;',
                     'justify-content: flex-start !important;', 'text-align: left !important;'):
            self.assertIn(rule, code)


if __name__ == "__main__":
    unittest.main()
