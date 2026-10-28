"""Sjablonen slaan instellingen op en maken uitsluitend nieuwe voorstellen."""
import copy
from datetime import date, time
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import opslag
import sjablonen


class SjablonenTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        for p in (patch.dict(os.environ, {"ASSISTENT_LOKAAL": "1"}),
                  patch.object(opslag, "DATA_BESTAND", Path(self.tmp.name) / "data.json")):
            p.start()
            self.addCleanup(p.stop)
        self.taak = {"naam": "Ochtend", "soort": "taak", "titel": "Mail bijwerken", "minuten": 20}

    def test_alleen_herbruikbare_velden(self):
        bron = {**self.taak, "id": 27, "deadline": "2020-01-01", "bestand": "privé", "ongedaan": True}
        self.assertEqual(sjablonen.valideer(bron), self.taak)
        r = sjablonen.voorstel(bron)
        self.assertIsNone(r["gegevens"]["deadline"])
        self.assertNotIn("id", r["gegevens"])
        self.assertEqual(sjablonen.voorstel(bron, deadline=date(2026, 11, 3))["gegevens"]["deadline"], "2026-11-03")

    def test_afspraak_neemt_alleen_duur_en_locatie_over(self):
        bron = {"titel": "Training", "id": 33, "start": "2020-01-01T10:00", "einde": "2020-01-01T11:30", "locatie": "Park"}
        s = sjablonen.uit_resultaat("afspraak", bron)
        self.assertEqual(s["minuten"], 90)
        self.assertNotIn("start", s)
        with self.assertRaises(ValueError):
            sjablonen.voorstel(s)
        r = sjablonen.voorstel(s, date(2026, 11, 1), time(23, 30))["gegevens"]
        self.assertEqual(r["einde"], "2026-11-02T01:00")
        with self.assertRaises(ValueError):
            sjablonen.voorstel(s, date(2027, 3, 28), time(2, 30))

    def test_concept_nieuwe_geldigheid_zonder_code(self):
        s = sjablonen.uit_resultaat("actielink", {"titel": "PT", "prijs_cent": 4500, "aangemaakt": "2020-01-01T00:00:00+00:00", "vervalt": "2020-01-03T00:00:00+00:00", "code": "geheim"})
        self.assertEqual(s["uren"], 48)
        self.assertEqual(sjablonen.voorstel(s)["gegevens"], {"titel": "PT", "prijs_cent": 4500, "uren": 48})

    def test_validatie_geen_bool_als_minuten_of_verkeerd_soort(self):
        for s in ({**self.taak, "minuten": True}, {**self.taak, "minuten": 0}, {**self.taak, "naam": " "}, {**self.taak, "soort": "betaling"}):
            with self.subTest(s=s), self.assertRaises(ValueError):
                sjablonen.valideer(s)

    def test_verloren_antwoord_maakt_geen_dubbel_sjabloon(self):
        echt = opslag.opslaan
        def verlies(g):
            echt(g)
            raise opslag.httpx.ReadTimeout("Antwoord verloren")
        with patch.object(opslag, "opslaan", side_effect=verlies), self.assertRaises(opslag.httpx.ReadTimeout):
            opslag.sjabloon_opslaan("zelfde", self.taak)
        opslag.sjabloon_opslaan("zelfde", self.taak)
        self.assertEqual(opslag.laden()["sjablonen"], {"zelfde": self.taak})
        self.assertEqual(opslag.laden()["taken"], [])

    def test_verwijderen_weigert_verouderde_versie(self):
        opslag.sjabloon_opslaan("s", self.taak)
        opslag.sjabloon_opslaan("s", {**self.taak, "titel": "Gewijzigd"})
        with self.assertRaises(ValueError):
            opslag.sjabloon_verwijderen("s", self.taak)
        huidig = opslag.laden()["sjablonen"]["s"]
        opslag.sjabloon_verwijderen("s", huidig)
        opslag.sjabloon_verwijderen("s", huidig)
        self.assertEqual(opslag.laden()["sjablonen"], {})

    def test_limiet_en_schrijffout(self):
        g = opslag.laden()
        g["sjablonen"] = {str(i): self.taak for i in range(100)}
        opslag.opslaan(g)
        with self.assertRaises(ValueError):
            opslag.sjabloon_opslaan("nieuw", self.taak)
        opslag.sjabloon_opslaan("0", {**self.taak, "minuten": 15})
        with patch.object(opslag, "opslaan", side_effect=OSError("vol")), self.assertRaises(OSError):
            opslag.sjabloon_opslaan("0", self.taak)
        self.assertEqual(opslag.laden()["sjablonen"]["0"]["minuten"], 15)

    def test_scherm_pas_uitvoeren_na_bevestiging(self):
        from streamlit.testing.v1 import AppTest
        app = AppTest.from_string("import sjablonen_scherm\nsjablonen_scherm.pagina()").run()
        app.text_input[0].set_value("Ochtend")
        app.text_input[1].set_value("Mail bijwerken")
        next(b for b in app.button if b.label == "Sjabloon opslaan").click().run()
        self.assertFalse(app.exception)
        self.assertEqual(len(opslag.laden()["sjablonen"]), 1)
        self.assertEqual(opslag.laden()["taken"], [])
        next(b for b in app.button if b.label == "Voorstel voorbereiden").click().run()
        self.assertFalse(app.exception)
        self.assertEqual(opslag.laden()["taken"], [])
        next(b for b in app.button if b.label == "Bevestigen").click().run()
        self.assertFalse(app.exception)
        self.assertEqual(len(opslag.laden()["taken"]), 1)

    def test_dagplan_vers_en_accountwisseling_wist_selectie(self):
        from streamlit.testing.v1 import AppTest
        app = AppTest.from_string('''
import streamlit as st
import sjablonen_scherm
import opslag
from unittest.mock import patch
sjablonen_scherm._account()
if st.button("Voorbereiden"):
    with patch.object(opslag, "dagvoorstel", return_value={"vers": True}) as voorstel:
        sjablonen_scherm.voorbereiden({"naam": "Werkdag", "soort": "dagplan"})
        st.session_state.sj_aantal = voorstel.call_count
''').run()
        app.button[0].click().run()
        self.assertFalse(app.exception)
        self.assertEqual(app.session_state["_os_dagplan"]["gegevens"], {"vers": True})
        self.assertEqual(app.session_state["sj_aantal"], 1)
        app.session_state["naam"] = "ander account"
        app.run()
        self.assertNotIn("sj_aantal", app.session_state)

    def test_csv_selecteert_gereedschap_zonder_bestandsverwerking(self):
        from streamlit.testing.v1 import AppTest
        app = AppTest.from_string('''
import streamlit as st
import sjablonen_scherm
if st.button("Openen"):
    sjablonen_scherm.voorbereiden({"naam": "Omzetanalyse", "soort": "csv"})
''').run()
        app.button[0].click().run()
        self.assertFalse(app.exception)
        self.assertEqual(app.session_state["bt_bewerking"], "CSV analyseren")
        self.assertEqual(opslag.laden()["taken"], [])


if __name__ == "__main__":
    unittest.main()
