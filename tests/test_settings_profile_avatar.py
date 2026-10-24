import ast
from pathlib import Path
import unittest

source = Path("app.py").read_text(encoding="utf-8")


class SettingsProfileAvatarTests(unittest.TestCase):
    def test_profile_image_or_default_avatar(self):
        fn = next(n for n in ast.parse(source).body if isinstance(n, ast.FunctionDef) and n.name == "instellingen_tabblad")
        code = ast.get_source_segment(source, fn)
        for expected in ("opslag.profielfoto(", 'st.image(profiel_foto, width=44)', ':material/account_circle:', 'kies("Account")', 'st.columns([1, 8]'):
            self.assertIn(expected, code)

if __name__ == "__main__":
    unittest.main()
