import ast
from pathlib import Path
import unittest

source = Path("app.py").read_text(encoding="utf-8")


class SettingsGridAlignmentTests(unittest.TestCase):
    def test_settings_labels_are_anchored_left(self):
        node = next(n for n in ast.parse(source).body if isinstance(n, ast.FunctionDef) and n.name == "instellingen_tabblad")
        code = ast.get_source_segment(source, node)
        for rule in ('display: block !important;', 'padding-left: 72px !important;',
                     'position: absolute !important;', 'left: 16px !important;',
                     'text-align: left !important;'):
            self.assertIn(rule, code)


if __name__ == "__main__":
    unittest.main()
