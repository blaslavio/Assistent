import ast
from pathlib import Path
import unittest


class ProfileTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = Path("app.py").read_text(encoding="utf-8")
        cls.tree = ast.parse(cls.source)

    def test_profile_uses_existing_booking_and_shop(self):
        method = next(n for n in self.tree.body if isinstance(n, ast.FunctionDef) and n.name == "profielkaart")
        source = ast.get_source_segment(self.source, method)
        self.assertIn('_in_app("winkel", w["adres"])', source)
        self.assertIn('_in_app("boek", b["adres"])', source)

    def test_private_login_number_not_displayed(self):
        method = next(n for n in self.tree.body if isinstance(n, ast.FunctionDef) and n.name == "profielkaart")
        source = ast.get_source_segment(self.source, method)
        self.assertIn('p.get("contact_telefoon")', source)
        self.assertNotIn("telefoon_eind", source)
        self.assertNotIn("telefoon_hash", source)

    def test_settings_has_distinct_workspace(self):
        method = next(n for n in self.tree.body if isinstance(n, ast.FunctionDef) and n.name == "instellingen_tabblad")
        source = ast.get_source_segment(self.source, method)
        self.assertIn("JOUW WERKRUIMTE", source)
        self.assertIn("Beheer en voorkeuren", source)
