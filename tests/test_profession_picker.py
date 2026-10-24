import ast
from pathlib import Path
import unittest

SOURCE = Path(__file__).resolve().parents[1].joinpath("zaak_scherm.py").read_text(encoding="utf-8")


class ProfessionPickerTests(unittest.TestCase):
    def test_profession_picker_is_sorted_and_unselected_for_new_users(self):
        fn = next(n for n in ast.parse(SOURCE).body if isinstance(n, ast.FunctionDef) and n.name == "beroep_instellingen")
        code = ast.get_source_segment(SOURCE, fn)
        self.assertIn("sorted((beroep.naam_van(k) for k in beroep.BEROEPEN), key=str.casefold)", code)
        self.assertIn("index=None if not nu", code)
        self.assertIn("Nog geen beroep gekozen", code)
        self.assertIn('st.container(key="onderneming_snel")', code)
        self.assertNotIn("with st.container(border=True):", code)


if __name__ == "__main__":
    unittest.main()
