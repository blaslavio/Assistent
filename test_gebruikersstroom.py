"""Volledige lokale stroom: opdracht, bevestigen, bron, back-up, herstel en undo."""
import io
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import streamlit as st
import opslag
import werkbronnen


class GebruikersstroomTest(unittest.TestCase):
    def test_werkstroom_met_echte_schermen_en_opslag(self):
        from streamlit.testing.v1 import AppTest
        with tempfile.TemporaryDirectory() as mapje, patch.dict(os.environ, {"ASSISTENT_LOKAAL": "1"}), \
                patch.object(opslag, "DATA_BESTAND", Path(mapje) / "data.json"), \
                patch.object(st, "file_uploader", return_value=None) as upload:
            app = AppTest.from_string('''
import streamlit as st
import universal_os
import werkbronnen_scherm
import planning_backup_scherm
scherm = st.radio("Scherm", ["Assistent", "Bronnen", "Back-up"])
if scherm == "Assistent":
    universal_os.pagina()
elif scherm == "Bronnen":
    werkbronnen_scherm.pagina()
else:
    planning_backup_scherm.pagina()
''').run()
            app.chat_input[0].set_value("Taak Onderzoek morgen").run()
            self.assertFalse(app.exception)
            self.assertEqual(opslag.laden()["taken"], [])
            next(b for b in app.button if b.label == "Bevestigen").click().run()
            self.assertFalse(app.exception)
            self.assertEqual(len(opslag.laden()["taken"]), 1)
            app.radio[0].set_value("Bronnen").run()
            next(i for i in app.text_input if i.label == "Titel van de koppeling").set_value("Bevindingen")
            app.text_area[0].set_value("Samenvatting van het onderzoek.")
            next(b for b in app.button if b.label == "Bron koppelen").click().run()
            self.assertFalse(app.exception)
            self.assertEqual(len(opslag.laden()["werkbronnen"]), 1)
            app.radio[0].set_value("Back-up").run()
            next(b for b in app.button if b.label == "Maak planningback-up").click().run()
            data = io.BytesIO(app.session_state["pb_export_data"])
            data.name = "backup.json"
            upload.return_value = data
            app.run()
            next(b for b in app.button if b.label.startswith("Controleer bestand")).click().run()
            self.assertEqual(len(opslag.laden()["taken"]), 1)
            app.checkbox[0].check()
            next(b for b in app.button if b.label == "Voeg back-up toe").click().run()
            self.assertFalse(app.exception)
            self.assertEqual(len(opslag.laden()["taken"]), 2)
            app.radio[0].set_value("Assistent").run()
            next(b for b in app.button if b.label == "Ongedaan maken").click().run()
            self.assertFalse(app.exception)
            self.assertEqual(len(opslag.laden()["taken"]), 1)
            self.assertTrue(werkbronnen.overzicht(opslag.laden())[0]["doel_ontbreekt"])
            app.radio[0].set_value("Bronnen").run()
            self.assertFalse(app.exception)
            self.assertTrue(any("gekoppelde werk is verwijderd" in w.value for w in app.warning))


if __name__ == "__main__":
    unittest.main()
