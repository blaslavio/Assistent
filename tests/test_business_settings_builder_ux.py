import ast
from pathlib import Path
import unittest

APP = Path("app.py").read_text(encoding="utf-8")
SHOP = Path("samen_scherm.py").read_text(encoding="utf-8")
BUSINESS = Path("zaak_scherm.py").read_text(encoding="utf-8")


class BusinessSettingsBuilderUXTests(unittest.TestCase):
    def test_settings_context_preserved_when_navigating(self):
        self.assertNotIn('st.session_state.pop("inst_groep", None)', APP)
        self.assertIn('st.session_state.inst_groep = naam', APP)
        self.assertIn('kies(None)', APP)

    def test_shop_builder_has_independent_tools(self):
        for tool in ("Identiteit", "Vormgeving", "Verzending", "Publicatie"):
            self.assertIn(f'"{tool}"', SHOP)
        self.assertIn('key="winkelbouwer_tool"', SHOP)
        self.assertIn('with st.form(f"winkel_{onderdeel}"', SHOP)
        self.assertIn('winkel_opslaan(w.get("adres", "")', SHOP)
        self.assertIn('with st.popover("Wat kan ik hiermee?"', SHOP)

    def test_business_settings_are_fragment_and_explain_tools(self):
        self.assertIn('def beroep_instellingen()', BUSINESS)
        self.assertIn('with st.popover("Uitleg"', BUSINESS)
        self.assertIn('uitleg.get(t,', BUSINESS)
        self.assertIn('alle_tools =', BUSINESS)
        self.assertIn('"werkrooster": ("zaak_deel", "Rooster")', BUSINESS)
        self.assertIn('delen = ["Vandaag", "Rooster", "Afspraken"]', BUSINESS)


if __name__ == "__main__":
    unittest.main()
