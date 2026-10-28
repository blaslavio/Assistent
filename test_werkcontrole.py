"""Leesgereedschap rapporteert echte gegevensproblemen en blijft accountgebonden."""
import copy
from datetime import date
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import gegevenscontrole
import opslag
import planning_backup
import werkzoeken


class WerkcontroleTest(unittest.TestCase):
    def setUp(self):
        self.g = copy.deepcopy(opslag.LEEG)
        self.g["taken"] = [{"id": 1, "titel": "Café begroting", "minuten": 30, "deadline": "2030-01-07", "klaar": False}]
        self.g["afspraken"] = [{"id": 2, "titel": "Begroting bespreken", "start": "2030-01-07T10:00", "einde": "2030-01-07T11:00", "notitie": "Café"}]
        self.g["volgend_id"] = 3

    def test_controle_van_geldige_data_schrijft_niets(self):
        origineel = copy.deepcopy(self.g)
        r = gegevenscontrole.controleer(self.g)
        self.assertTrue(r["volledig"])
        self.assertEqual(r["meldingen"], [])
        self.assertEqual(self.g, origineel)

    def test_dubbele_ids_en_achterlopende_teller(self):
        self.g["afspraken"][0]["id"] = 1
        self.g["volgend_id"] = 1
        codes = {m["code"] for m in gegevenscontrole.controleer(self.g)["meldingen"]}
        self.assertIn("dubbel_id", codes)
        self.assertIn("id_teller_achtergelopen", codes)

    def test_ontbrekende_verwijzingen_en_cyclus(self):
        self.g["taken"][0]["afhankelijk_van"] = [1, 999]
        self.g["afspraken"][0]["taak_id"] = 999
        codes = {m["code"] for m in gegevenscontrole.controleer(self.g)["meldingen"]}
        self.assertIn("cyclus_of_afhankelijke_wachtketen", codes)
        self.assertIn("ontbrekende_voorganger", codes)
        self.assertIn("ontbrekende_focustaak", codes)

    def test_overlap_maar_aansluiten_is_geen_overlap(self):
        self.g["afspraken"] += [{"id": 3, "titel": "Tweede", "start": "2030-01-07T10:30", "einde": "2030-01-07T11:30"},
                                {"id": 4, "titel": "Derde", "start": "2030-01-07T11:30", "einde": "2030-01-07T12:00"}]
        self.g["volgend_id"] = 5
        overlaps = [m for m in gegevenscontrole.controleer(self.g)["meldingen"] if m["code"] == "overlappende_afspraken"]
        self.assertEqual(len(overlaps), 1)
        self.assertEqual(overlaps[0]["ids"], [2, 3])

    def test_onleesbare_data_en_rapportlimiet_zijn_zichtbaar(self):
        self.g["afspraken"][0]["start"] = "fout"
        self.assertFalse(gegevenscontrole.controleer(self.g)["volledig"])
        self.g["taken"] = [None] * 220
        r = gegevenscontrole.controleer(self.g)
        self.assertFalse(r["volledig"])
        self.assertEqual(len(r["meldingen"]), 200)

    def test_rapport_bevat_geen_titels_notities_of_instellingen(self):
        self.g["instellingen"] = {"api_sleutel": "GEHEIM"}
        self.g["taken"][0].update(titel="GEHEIM", notitie="GEHEIM", minuten=-1)
        tekst = json.dumps(gegevenscontrole.controleer(self.g))
        self.assertNotIn("GEHEIM", tekst)
        self.assertIn("ongeldige_taakduur", tekst)

    def test_zoeken_accenten_hoofdletters_en_alle_woorden(self):
        r = werkzoeken.zoek(self.g, "CAFE begroting")
        self.assertEqual(r["totaal"], 2)
        self.assertEqual(r["resultaten"][0]["soort"], "taak")
        self.assertEqual(werkzoeken.zoek(self.g, "café ontbreekt")["totaal"], 0)

    def test_zoeken_filters_deadline_en_uitgesloten_geheimen(self):
        self.g["instellingen"] = {"api_sleutel": "ALLEEN-IN-CONFIG"}
        self.assertEqual(werkzoeken.zoek(self.g, "ALLEEN-IN-CONFIG")["totaal"], 0)
        r = werkzoeken.zoek(self.g, "begroting", ["taak"], vandaag=date(2030, 1, 8))
        self.assertEqual(r["totaal"], 1)
        self.assertEqual(r["resultaten"][0]["status"], "deadline verstreken")
        self.g["taken"][0]["klaar"] = True
        self.assertEqual(werkzoeken.zoek(self.g, "begroting", ["taak"], alleen_open=True)["totaal"], 0)

    def test_zoeken_leeg_te_lang_en_begrensd(self):
        self.assertEqual(werkzoeken.zoek(self.g, " ")["totaal"], 0)
        with self.assertRaises(ValueError):
            werkzoeken.zoek(self.g, "x" * 161)
        self.g["taken"] = [{"id": i, "titel": "Zoekbaar", "klaar": False} for i in range(1001)]
        r = werkzoeken.zoek(self.g, "zoek")
        self.assertEqual(r["totaal"], 1001)
        self.assertEqual(len(r["resultaten"]), 1000)
        self.assertTrue(r["begrensd"])

    def test_selectieve_export_en_herstel_behouden_gekozen_verwijzingen(self):
        self.g["afspraken"][0]["taak_id"] = 1
        data = planning_backup.exporteer(self.g, ["afspraken"])
        g = planning_backup.lees(data)["gegevens"]
        self.assertEqual(g["taken"], [])
        self.assertNotIn("taak_id", g["afspraken"][0])
        volledig = planning_backup.exporteer(self.g)
        alleen_taken = planning_backup.lees(planning_backup.selecteer(volledig, ["taken"]))["gegevens"]
        self.assertEqual(len(alleen_taken["taken"]), 1)
        self.assertEqual(alleen_taken["afspraken"], [])
        with self.assertRaises(ValueError):
            planning_backup.selecteer(volledig, [])

    def test_schermen_en_accountwisseling_wissen_zoekvraag(self):
        from streamlit.testing.v1 import AppTest
        with tempfile.TemporaryDirectory() as d, patch.dict(os.environ, {"ASSISTENT_LOKAAL": "1"}), patch.object(opslag, "DATA_BESTAND", Path(d) / "data.json"):
            opslag.opslaan(self.g)
            app = AppTest.from_string("import werkcontrole_scherm\nwerkcontrole_scherm.zoeken_pagina()").run()
            app.text_input[0].set_value("cafe").run()
            self.assertFalse(app.exception)
            self.assertTrue(any("2 resultaten" in c.value for c in app.caption))
            app.session_state["naam"] = "ander"
            app.run()
            self.assertEqual(app.text_input[0].value, "")
            app = AppTest.from_string("import werkcontrole_scherm\nwerkcontrole_scherm.controle_pagina()").run()
            self.assertFalse(app.exception)
            self.assertTrue(app.success)

    def test_bron_bij_onleesbare_afspraak_wordt_niet_verweesd_genoemd(self):
        self.g["afspraken"][0]["start"] = "fout"
        self.g["werkbronnen"] = {"b": {"soort": "notitie", "titel": "Bron", "tekst": "Inhoud", "doel_soort": "afspraak", "doel_id": 2}}
        codes = {m["code"] for m in gegevenscontrole.controleer(self.g)["meldingen"]}
        self.assertIn("ongeldige_afspraaktijd", codes)
        self.assertNotIn("bron_zonder_doel", codes)


if __name__ == "__main__":
    unittest.main()
