"""Activiteiten weerspiegelen opgeslagen feiten en veilige bestaande undo."""
import copy
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from datetime import datetime, timezone, timedelta

import actieoverzicht
import actielinks
import opslag


class OverzichtTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        for p in (patch.dict(os.environ, {"ASSISTENT_LOKAAL": "1"}),
                  patch.object(opslag, "DATA_BESTAND", Path(self.tmp.name) / "data.json")):
            p.start()
            self.addCleanup(p.stop)

    def maak(self):
        return opslag.intentie_bevestigen("opdracht", {"wat": "taak", "titel": "Bellen", "deadline": None})

    def test_lege_geschiedenis_en_ouder_ontvangstbewijs(self):
        self.assertEqual(actieoverzicht.overzicht({}), [])
        r = actieoverzicht.overzicht({"taken": [{"id": 1}], "intentie_ontvangst": {
            "oud": {"wat": "taak", "item": {"id": 1}}}})[0]
        self.assertIsNone(r["tijd"])
        self.assertEqual(r["herkomst"], {})
        self.assertEqual(r["status"], "uitgevoerd")

    def test_opslag_herhaling_en_undo(self):
        eerste = self.maak()
        self.assertEqual(eerste, self.maak())
        self.assertIsNotNone(datetime.fromisoformat(eerste["herkomst"]["tijd"]).tzinfo)
        self.assertEqual(eerste["herkomst"]["taken_in_bron"], 0)
        self.assertEqual(eerste["herkomst"]["afspraken_in_bron"], 0)
        r = actieoverzicht.overzicht(opslag.laden())[0]
        self.assertTrue(r["terugdraaibaar"])
        opslag.intentie_ongedaan(r["id"])
        r = actieoverzicht.overzicht(opslag.laden())[0]
        self.assertEqual(r["status"], "ongedaan")
        self.assertFalse(r["terugdraaibaar"])

    def test_wijziging_en_verwijdering_worden_herkend_zonder_mutatie(self):
        self.maak()
        g = opslag.laden()
        g["taken"][0]["titel"] = "Aangepast"
        origineel = copy.deepcopy(g)
        self.assertEqual(actieoverzicht.overzicht(g)[0]["status"], "later gewijzigd")
        self.assertEqual(g, origineel)
        g["taken"].clear()
        self.assertEqual(actieoverzicht.overzicht(g)[0]["status"], "verwijderd of deels verwijderd")

    def test_actielinks_verlopen_en_ingetrokken(self):
        moment = datetime(2026, 10, 28, tzinfo=timezone.utc)
        with patch.object(actielinks, "nu", return_value=moment):
            link = opslag.actielink_opslaan("link", {"titel": "Training", "prijs_cent": 100, "uren": 1})
            self.assertEqual(actieoverzicht.overzicht(opslag.laden())[0]["status"], "actief concept")
        with patch.object(actielinks, "nu", return_value=moment + timedelta(hours=1)):
            self.assertEqual(actieoverzicht.overzicht(opslag.laden())[0]["status"], "verlopen")
        opslag.actielink_intrekken(link["code"])
        self.assertEqual(actieoverzicht.overzicht(opslag.laden())[0]["status"], "ingetrokken")

    def test_herplan_controleert_ook_taakwijziging(self):
        g = {"afspraken": [], "taken": [{"id": 1, "resterend_minuten": 90}],
             "intentie_ontvangst": {"h": {"wat": "herplan", "items": [],
                 "taakwijzigingen": [{"na": {"id": 1, "resterend_minuten": 30}}]}}}
        self.assertEqual(actieoverzicht.overzicht(g)[0]["status"], "later gewijzigd")

    def test_scherm_filter_en_bevestigde_undo(self):
        from streamlit.testing.v1 import AppTest
        self.maak()
        app = AppTest.from_string("import actieoverzicht_scherm\nactieoverzicht_scherm.pagina()").run()
        self.assertFalse(app.exception)
        knop = next(b for b in app.button if b.label == "Ongedaan maken")
        self.assertTrue(knop.disabled)
        app.checkbox[0].check().run()
        next(b for b in app.button if b.label == "Ongedaan maken").click().run()
        self.assertFalse(app.exception)
        self.assertEqual(actieoverzicht.overzicht(opslag.laden())[0]["status"], "ongedaan")
        app.text_input[0].set_value("bestaat niet").run()
        self.assertFalse(app.exception)
        self.assertTrue(any("0 van 1" in c.value for c in app.caption))


if __name__ == "__main__":
    unittest.main()
