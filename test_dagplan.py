"""Dagplanning voor vandaag, bewerkingen en atomair opslaan zonder productiegegevens."""

import copy
import os
import tempfile
import unittest
from datetime import datetime, time, timedelta
from pathlib import Path
from unittest.mock import patch

import dagplan
import intenties
import opslag


class DagplanTest(unittest.TestCase):
    def setUp(self):
        self.nu = datetime(2030, 1, 7, 9)
        self.g = copy.deepcopy(opslag.LEEG)
        self.g["taken"] = [{"id": 1, "titel": "Belasting", "deadline": "2030-01-07", "minuten": 60, "klaar": False},
                           {"id": 2, "titel": "Leren", "deadline": None, "minuten": 30, "klaar": False}]

    def test_route_en_voorstel_rond_afspraken_met_pauze(self):
        self.assertEqual(intenties.routeer("Plan mijn dag")["soort"], "dagplan")
        self.g["afspraken"] = [{"id": 10, "titel": "Overleg", "start": "2030-01-07T09:00", "einde": "2030-01-07T10:00"}]
        origineel = copy.deepcopy(self.g)
        plan = dagplan.voorstel(self.g, self.nu)
        items = dagplan.valideer(plan, self.g, self.nu)
        self.assertEqual(self.g, origineel)
        self.assertEqual(items[0]["taak_id"], 1)
        self.assertEqual(items[0]["start"], "2030-01-07T10:10")
        self.assertGreaterEqual(datetime.fromisoformat(items[1]["start"]) - datetime.fromisoformat(items[0]["einde"]), timedelta(minutes=10))

    def test_lange_taak_wordt_gesplitst(self):
        self.g["taken"] = [{**self.g["taken"][0], "minuten": 180}]
        plan = dagplan.voorstel(self.g, self.nu)
        items = dagplan.valideer(plan, self.g, self.nu)
        duren = [(datetime.fromisoformat(i["einde"]) - datetime.fromisoformat(i["start"])).total_seconds() / 60 for i in items]
        self.assertEqual(duren, [120, 60])

    def test_volledige_dag_en_weekend_worden_niet_volgepland(self):
        self.g["afspraken"] = [{"start": "2030-01-07"}]
        self.assertTrue(all(not r["blokken"] for r in dagplan.voorstel(self.g, self.nu)["regels"]))
        self.g["afspraken"] = []
        self.assertTrue(all(not r["blokken"] for r in dagplan.voorstel(self.g, datetime(2030, 1, 12, 9))["regels"]))

    def test_geplande_en_afgeronde_taken_worden_overgeslagen(self):
        self.g["taken"][1]["klaar"] = True
        self.g["afspraken"] = [{"start": "2030-01-07T14:00", "einde": "2030-01-07T15:00", "taak_id": 1}]
        self.assertFalse(dagplan.voorstel(self.g, self.nu)["regels"])

    def test_bewerken_en_weglaten(self):
        plan = dagplan.voorstel(self.g, self.nu)
        plan["regels"][0]["blokken"][0].update(start="2030-01-07T14:00", einde="2030-01-07T15:00")
        plan["regels"][1]["blokken"][0]["opnemen"] = False
        items = dagplan.valideer(plan, self.g, self.nu)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["start"], "2030-01-07T14:00")

    def test_gewijzigde_taak_of_overlap_blokkeert_hele_plan(self):
        plan = dagplan.voorstel(self.g, self.nu)
        self.g["taken"][0]["titel"] = "Aangepast"
        with self.assertRaises(dagplan.PlanOngeldig):
            dagplan.valideer(plan, self.g, self.nu)
        self.g["taken"][0]["titel"] = "Belasting"
        self.g["afspraken"] = [{"start": "2030-01-07T09:30", "einde": "2030-01-07T10:30"}]
        with self.assertRaises(dagplan.PlanOngeldig):
            dagplan.valideer(plan, self.g, self.nu)

    def test_verouderd_voorstel_of_te_korte_pauze(self):
        plan = dagplan.voorstel(self.g, self.nu)
        with self.assertRaises(dagplan.PlanOngeldig):
            dagplan.valideer(plan, self.g, self.nu + timedelta(days=1))
        plan["regels"][1]["blokken"][0].update(start="2030-01-07T10:00", einde="2030-01-07T10:30")
        with self.assertRaises(dagplan.PlanOngeldig):
            dagplan.valideer(plan, self.g, self.nu)

    def test_deel_van_lange_taak_past_met_duidelijke_rest(self):
        self.g["taken"] = [{**self.g["taken"][0], "minuten": 180}]
        self.g["instellingen"] = {"planuren": {"van": "09:00", "tot": "10:30"}}
        plan = dagplan.voorstel(self.g, self.nu)
        self.assertEqual(plan["regels"][0]["rest"], 90)
        self.assertEqual(len(dagplan.valideer(plan, self.g, self.nu)), 1)

    def test_geen_blokken_in_het_verleden_of_na_planuren(self):
        plan = dagplan.voorstel(self.g, datetime(2030, 1, 7, 19))
        self.assertTrue(all(not r["blokken"] for r in plan["regels"]))
        plan = dagplan.voorstel(self.g, self.nu)
        plan["regels"][0]["blokken"][0].update(start="2030-01-07T08:00", einde="2030-01-07T09:00")
        with self.assertRaises(dagplan.PlanOngeldig):
            dagplan.valideer(plan, self.g, self.nu)


class DagplanOpslagTest(unittest.TestCase):
    def setUp(self):
        mapje = tempfile.TemporaryDirectory()
        self.addCleanup(mapje.cleanup)
        for p in (patch.dict(os.environ, ASSISTENT_LOKAAL="1"),
                  patch.object(opslag, "DATA_BESTAND", Path(mapje.name) / "gegevens.json"),
                  patch.object(dagplan, "nu", return_value=datetime(2030, 1, 7, 9))):
            p.start()
            self.addCleanup(p.stop)
        opslag.taak_toevoegen("Belasting", deadline="2030-01-07", minuten=60)
        opslag.taak_toevoegen("Leren", minuten=30)

    def test_atomair_bevestigen_en_ongedaan(self):
        plan = opslag.dagvoorstel()
        opslaan = opslag.opslaan
        with patch.object(opslag, "opslaan", wraps=opslaan) as schrijf:
            ontvangst = opslag.dagplan_bevestigen("plan", plan)
            self.assertEqual(schrijf.call_count, 1)
        self.assertEqual(opslag.dagplan_bevestigen("plan", plan), ontvangst)
        self.assertEqual(len(opslag.laden()["afspraken"]), 2)
        self.assertFalse(any(t["klaar"] for t in opslag.laden()["taken"]))
        antwoord = opslag.intentie_ongedaan("plan")
        self.assertEqual(opslag.intentie_ongedaan("plan"), antwoord)
        self.assertFalse(opslag.laden()["afspraken"])
        self.assertEqual(len(opslag.laden()["taken"]), 2)

    def test_fout_in_een_blok_bewaart_niets(self):
        plan = opslag.dagvoorstel()
        plan["regels"][1]["blokken"][0]["start"] = "2030-01-07T09:30"
        with self.assertRaises(dagplan.PlanOngeldig):
            opslag.dagplan_bevestigen("plan", plan)
        self.assertFalse(opslag.laden()["afspraken"])
        self.assertFalse(opslag.laden().get("intentie_ontvangst"))

    def test_verloren_antwoord_maakt_geen_dubbele_blokken(self):
        plan = opslag.dagvoorstel()
        schrijf = opslag.opslaan
        def verlies(g):
            schrijf(g)
            raise opslag.httpx.ReadTimeout("Antwoord verloren")
        with patch.object(opslag, "opslaan", side_effect=verlies), self.assertRaises(opslag.httpx.ReadTimeout):
            opslag.dagplan_bevestigen("plan", plan)
        opslag.dagplan_bevestigen("plan", plan)
        self.assertEqual(len(opslag.laden()["afspraken"]), 2)

    def test_gui_bewerken_weglaten_en_bevestigen(self):
        from streamlit.testing.v1 import AppTest
        app = AppTest.from_string("import universal_os\nuniversal_os.pagina()").run()
        app.chat_input[0].set_value("Plan mijn dag").run()
        self.assertFalse(app.exception)
        self.assertEqual(len(app.chat_input), 1)
        self.assertFalse(opslag.laden()["afspraken"])
        app.time_input[0].set_value(time(14))
        app.time_input[1].set_value(time(15))
        app.checkbox[1].uncheck()
        app.button(key="dag_bevestig").click().run()
        self.assertFalse(app.exception)
        self.assertEqual(len(opslag.laden()["afspraken"]), 1)
        self.assertEqual(opslag.laden()["afspraken"][0]["start"], "2030-01-07T14:00")
        app.button(key="os_ongedaan").click().run()
        self.assertFalse(opslag.laden()["afspraken"])

    def test_gui_annuleren_en_tussentijdse_taakwijziging(self):
        from streamlit.testing.v1 import AppTest
        app = AppTest.from_string("import universal_os\nuniversal_os.pagina()").run()
        app.chat_input[0].set_value("Plan mijn dag").run()
        app.button(key="dag_annuleer").click().run()
        self.assertFalse(opslag.laden()["afspraken"])
        app.chat_input[0].set_value("Plan mijn dag").run()
        taak = opslag.laden()["taken"][0]
        opslag.taak_bijwerken(taak["id"], titel="Gewijzigd")
        app.button(key="dag_bevestig").click().run()
        self.assertFalse(app.exception)
        self.assertTrue(app.error)
        self.assertFalse(opslag.laden()["afspraken"])
        self.assertFalse(app.time_input[0].disabled)

    def test_gui_verloren_antwoord_blijft_herhaalbaar(self):
        from streamlit.testing.v1 import AppTest
        app = AppTest.from_string("import universal_os\nuniversal_os.pagina()").run()
        app.chat_input[0].set_value("Plan mijn dag").run()
        app.checkbox[1].uncheck()
        app.time_input[2].set_value(None)  # een weggelaten blok hoeft geen tijd te hebben
        echt = opslag.dagplan_bevestigen
        def verlies(*args):
            echt(*args)
            raise opslag.httpx.ReadTimeout("Antwoord verloren")
        with patch.object(opslag, "dagplan_bevestigen", side_effect=verlies):
            app.button(key="dag_bevestig").click().run()
        self.assertTrue(app.error)
        self.assertFalse(app.exception)
        self.assertTrue(app.time_input[0].disabled)
        app.button(key="dag_bevestig").click().run()
        self.assertFalse(app.exception)
        self.assertEqual(len(opslag.laden()["afspraken"]), 1)


if __name__ == "__main__":
    unittest.main()
