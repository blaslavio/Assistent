"""Afhankelijkheden en capaciteitsgrenzen zonder externe diensten."""
import copy
from datetime import datetime
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import capaciteit
import dagplan
import herplanning
import inplannen
import opslag
import taakvolgorde


class WerkdrukTest(unittest.TestCase):
    def setUp(self):
        self.nu = datetime(2030, 1, 7, 9)
        self.g = copy.deepcopy(opslag.LEEG)
        self.g["taken"] = [
            {"id": 1, "titel": "Onderzoek", "minuten": 60, "deadline": None, "klaar": False},
            {"id": 2, "titel": "Rapport", "minuten": 60, "deadline": "2030-01-07", "klaar": False, "afhankelijk_van": [1]}]
        self.g["volgend_id"] = 10
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        for p in (patch.dict(os.environ, {"ASSISTENT_LOKAAL": "1"}), patch.object(opslag, "DATA_BESTAND", Path(self.tmp.name) / "data.json")):
            p.start()
            self.addCleanup(p.stop)
        opslag.opslaan(self.g)

    def test_cyclus_en_zelfverwijzing_worden_geweigerd(self):
        for deps in ([1], [2], [999], [True]):
            with self.subTest(deps=deps), self.assertRaises(ValueError):
                taakvolgorde.valideer(self.g["taken"], 1, deps)
        self.assertEqual(taakvolgorde.valideer(self.g["taken"], 2, [1, 1]), [1])

    def test_verwijderde_voorganger_blijft_blokkeren(self):
        self.g["taken"].pop(0)
        r = taakvolgorde.blokkades(self.g["taken"][0], self.g["taken"])
        self.assertTrue(r[0]["ontbreekt"])
        self.assertFalse(dagplan.voorstel(self.g, self.nu)["regels"][0]["blokken"])

    def test_plannen_is_geen_afronding(self):
        plan = dagplan.voorstel(self.g, self.nu)
        per_id = {r["taak"]["id"]: r for r in plan["regels"]}
        self.assertTrue(per_id[1]["blokken"])
        self.assertFalse(per_id[2]["blokken"])
        self.g["taken"][0]["klaar"] = True
        self.assertTrue(dagplan.voorstel(self.g, self.nu)["regels"][0]["blokken"])

    def test_heropenen_voorganger_blokkeert_ook_oud_voorstel(self):
        self.g["taken"][0]["klaar"] = True
        plan = dagplan.voorstel(self.g, self.nu)
        self.g["taken"][0]["klaar"] = False
        with self.assertRaises(dagplan.PlanOngeldig):
            dagplan.valideer(plan, self.g, self.nu)

    def test_herplanning_behoudt_afgeronde_en_ongekozen_voorgangers(self):
        plan = herplanning.voorstel(self.g, {"1": {"plannen": False}}, moment=self.nu)
        self.assertFalse(next(r for r in plan["regels"] if r["taak"]["id"] == 2)["blokken"])
        self.g["taken"][0]["klaar"] = True
        plan = herplanning.voorstel(self.g, moment=self.nu)
        self.assertTrue(plan["regels"][0]["blokken"])
        self.assertTrue(herplanning.valideer(plan, self.g, self.nu)["items"])

    def test_oude_planner_en_handmatige_focus_respecteren_blokkade(self):
        with patch.object(opslag, "afspraken_tussen", return_value=[]):
            regels = inplannen.voorstel(nu=self.nu)
        rapport = next(r for r in regels if r["taak_id"] == 2)
        self.assertFalse(rapport["blokken"])
        with self.assertRaises(ValueError):
            inplannen.vastleggen([{**rapport, "blokken": [{"start": "2030-01-07T10:00", "einde": "2030-01-07T11:00"}]}])
        with self.assertRaises(ValueError):
            opslag.afspraak_toevoegen("Rapport", "2030-01-07T10:00", taak_id=2)
        self.assertEqual(opslag.laden()["afspraken"], [])

    def test_afhankelijkheden_opslaan_en_verouderde_wijziging(self):
        opslag.taak_afhankelijkheden(2, [], [1])
        opslag.taak_afhankelijkheden(2, [], [1])
        with self.assertRaises(ValueError):
            opslag.taak_afhankelijkheden(2, [1], [999])
        self.assertEqual(opslag.laden()["taken"][1]["afhankelijk_van"], [])

    def test_geplande_taak_niet_achteraf_blokkeren(self):
        self.g["taken"][1]["afhankelijk_van"] = []
        self.g["afspraken"] = [{"id": 10, "taak_id": 2, "start": "2030-01-07T11:00", "einde": "2030-01-07T12:00"}]
        opslag.opslaan(self.g)
        with patch.object(dagplan, "nu", return_value=self.nu), self.assertRaises(ValueError):
            opslag.taak_afhankelijkheden(2, [1], [])
        self.assertEqual(opslag.laden()["taken"][1]["afhankelijk_van"], [])

    def test_deadline_tekort_ook_als_week_genoeg_ruimte_heeft(self):
        self.g["taken"][1]["minuten"] = 600
        r = capaciteit.rapport(self.g, 7, self.nu)
        self.assertEqual(r["grenzen"][0]["minimaal_tekort"], 60)
        self.assertEqual(r["grenzen"][-1]["minimaal_tekort"], 0)
        self.assertEqual(len(r["taken"][1]["geblokkeerd_door"]), 1)

    def test_overlappende_afspraken_niet_dubbel_aftrekken(self):
        self.g["afspraken"] = [
            {"start": "2030-01-07T10:00", "einde": "2030-01-07T12:00"},
            {"start": "2030-01-07T11:00", "einde": "2030-01-07T13:00"}]
        origineel = copy.deepcopy(self.g)
        r = capaciteit.rapport(self.g, 1, self.nu)
        self.assertEqual(r["dagen"][0]["vrij_minuten"], 340)
        self.assertEqual(self.g, origineel)

    def test_reserveringen_verlagen_werk_en_vrije_tijd(self):
        self.g["taken"] = [self.g["taken"][0]]
        self.g["afspraken"] = [{"taak_id": 1, "start": "2030-01-07T10:00", "einde": "2030-01-07T10:30"}] * 2
        grens = capaciteit.rapport(self.g, 1, self.nu)["grenzen"][0]
        self.assertEqual(grens["al_gereserveerd"], 30)
        self.assertEqual(grens["nog_in_te_plannen"], 30)
        self.assertEqual(grens["vrij_minuten"], 490)

    def test_hele_dag_weekend_en_verstreken_werkuren(self):
        self.g["afspraken"] = [{"start": "2030-01-07"}]
        self.assertEqual(capaciteit.rapport(self.g, 1, self.nu)["dagen"][0]["vrij_minuten"], 0)
        self.g["afspraken"] = []
        for moment in (datetime(2030, 1, 12, 9), datetime(2030, 1, 7, 19)):
            self.assertEqual(capaciteit.rapport(self.g, 1, moment)["dagen"][0]["vrij_minuten"], 0)

    def test_schatting_en_achterstand_zichtbaar(self):
        self.g["taken"][0].pop("minuten")
        self.g["taken"][0]["deadline"] = "2030-01-06"
        r = capaciteit.rapport(self.g, 1, self.nu)
        self.assertEqual(r["geschatte_taken"], 1)
        self.assertEqual(r["over_deadline"], 1)
        self.g["taken"][0]["deadline"] = "verkeerd"
        with self.assertRaises(dagplan.PlanOngeldig):
            capaciteit.rapport(self.g, 1, self.nu)

    def test_scherm_bewaart_explicit_en_weigert_cyclus(self):
        from streamlit.testing.v1 import AppTest
        with patch.object(dagplan, "nu", return_value=self.nu):
            app = AppTest.from_string("import taakplanning_scherm\ntaakplanning_scherm.pagina()").run()
            self.assertFalse(app.exception)
            app.multiselect[0].set_value([2])
            self.assertEqual(opslag.laden()["taken"][0].get("afhankelijk_van"), None)
            next(b for b in app.button if b.label == "Afhankelijkheden opslaan").click().run()
            self.assertFalse(app.exception)
            self.assertTrue(app.error)
            self.assertEqual(opslag.laden()["taken"][0].get("afhankelijk_van"), None)


if __name__ == "__main__":
    unittest.main()
