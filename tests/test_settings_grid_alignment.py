import ast
from pathlib import Path
import unittest

source = Path("app.py").read_text(encoding="utf-8")


class SettingsGridAlignmentTests(unittest.TestCase):
    def test_grid_has_explicit_icon_and_label_columns(self):
        node = next(n for n in ast.parse(source).body if isinstance(n, ast.FunctionDef) and n.name == "instellingen_tabblad")
        code = ast.get_source_segment(source, node)
        for rule in ('display: grid !important;', 'grid-template-columns: 38px minmax(0, 1fr) !important;',
                     'grid-column: 1 !important;', 'grid-column: 2 !important;',
                     'justify-self: stretch !important;', 'text-align: left !important;'):
            self.assertIn(rule, code)


if __name__ == "__main__":
    unittest.main()
