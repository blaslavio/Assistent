"""Regressietests voor de mobiele instellingenstructuur."""
import ast
from pathlib import Path
import unittest

SOURCE = Path(__file__).resolve().parents[1].joinpath("app.py").read_text(encoding="utf-8")
TREE = ast.parse(SOURCE)


def functie(naam):
    node = next(n for n in TREE.body if isinstance(n, ast.FunctionDef) and n.name == naam)
    return ast.get_source_segment(SOURCE, node)


class SettingsLayoutTests(unittest.TestCase):
    def test_profile_first_and_grouped_rows(self):
        code = functie("instellingen_tabblad")
        self.assertLess(code.index("inst_profiel"), code.index("Account en veiligheid"))
        self.assertIn("inst_rij_", code)
        self.assertIn('with st.expander("Alle apponderdelen"', code)
        self.assertNotIn("te_doen_blok()", code)

    def test_general_settings_uses_direct_rows(self):
        code = functie("instellingen_weergave")
        self.assertIn('type="tertiary", width="stretch"', code)
        self.assertNotIn('key=f"algemeen_sectie_{index}",\n                             icon=":material/arrow_forward:"', code)


if __name__ == "__main__":
    unittest.main()
