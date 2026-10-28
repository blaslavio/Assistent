"""Herplanning, resterende duur, uitloop en volledige terugdraaiing."""

import copy
import os
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

import dagplan
import herplanning
import intenties
import opslag


class HerplanningTest(unittest.TestCase):
    def setUp(self):
        self.nu = datetime(2030, 1, 7, 10)
        self.g = copy.deepcopy(opslag.LEEG)
        self.g["taken"] = [{"id": 1, "titel": "Belasting", "deadline": None, "klaar": False, "minuten": 60}]
        self.g["afspraken"] = [{"id": 10, "titel": "Overleg", "start": "2030-01-07T09:30", "einde": "2030-01-07T10:30"},
                               {"id": 11, "titel": "Belasting", "start": "2030-01-07T11:00", "einde": "2030-01-07T12:00", "taak_id": 1, "soort": "focus"}]

    def test_route_en_uitloop(self):
        self.assertEqual(intenties.routeer("Herplan de rest van vandaag")["soort"], "herplan")
        self.assertEqual(intenties.routeer("Deze taak is nog niet af")["soort"], "herplan")
        self.assertEqual(intenties.routeer("Dit overleg loopt een halfuur uit")["uitloop"], 30)
        plan = herplanning.voorstel(self.g, uitloop=30, moment=self.nu)
        wijziging = herplanning.valideer(plan, self.g, self.nu)
        self.assertEqual(wijziging["verlenging"]["na"]["einde"], "2030-01-07T11:00")
        self.assertEqual(wijziging["items"][0]["start"], "2030-01-07T11:10")
        self.assertEqual(self.g["afspraken"][0]["einde"], "2030-01-07T10:30")

    def test_resterende_minuten_en_uitvinken(self):
        plan = herplanning.voorstel(self.g, {"1": {"minuten": 25}}, moment=self.nu)
        wijziging = herplanning.valideer(plan, self.g, self.nu)
        self.assertEqual(wijziging["taakwijzigingen"][0]["na"]["resterend_minuten"], 25)
        self.assertEqual(len(wijziging["vervangt"]), 1)
        plan["regels"][0]["plannen"] = False
        with self.assertRaises(dagplan.PlanOngeldig):
            herplanning.valideer(plan, self.g, self.nu)
        overgeslagen = herplanning.voorstel(self.g, {"1": {"plannen": False}}, moment=self.nu)
        self.assertFalse(overgeslagen["vervangt"])

    def test_lopende_en_afgeronde_taken_blijven_staan(self):
        self.g["afspraken"][1].update(start="2030-01-07T09:45", einde="2030-01-07T10:45")
        self.assertFalse(herplanning.voorstel(self.g, moment=self.nu)["regels"])
        self.g["afspraken"][1].update(start="2030-01-07T11:00", einde="2030-01-07T12:00")
        self.g["taken"][0]["klaar"] = True
        self.assertFalse(herplanning.voorstel(self.g, moment=self.nu)["vervangt"])

    def test_gewijzigd_blok_en_begonnen_blok_blokkeren(self):
        plan = herplanning.voorstel(self.g, moment=self.nu)
        self.g["afspraken"][1]["titel"] = "Anders"
        with self.assertRaises(dagplan.PlanOngeldig):
            herplanning.valideer(plan, self.g, self.nu)
        self.g["afspraken"][1]["titel"] = "Belasting"
        with self.assertRaises(dagplan.PlanOngeldig):
            herplanning.valideer(plan, self.g, datetime(2030, 1, 7, 11, 1))

    def test_uitloop_mag_geen_vaste_afspraak_overschrijven(self):
        self.g["afspraken"].append({"id": 12, "titel": "Vast", "start": "2030-01-07T10:45", "einde": "2030-01-07T11:15"})
        plan = herplanning.voorstel(self.g, afspraak_id=10, uitloop=30, moment=self.nu)
        with self.assertRaises(dagplan.PlanOngeldig):
            herplanning.valideer(plan, self.g, self.nu)

    def test_verstreken_tijd_is_geen_automatisch_afgerond_werk(self):
        oud = {"id": 9, "titel": "Vroeg blok", "start": "2030-01-07T08:00", "einde": "2030-01-07T08:30", "taak_id": 1, "soort": "focus"}
        self.g["afspraken"].append(oud)
        plan = herplanning.voorstel(self.g, moment=self.nu)
        self.assertEqual(plan["regels"][0]["resterend_minuten"], 60)
        self.assertNotIn(oud, plan["vervangt"])

    def test_toekomstige_dagen_en_uitgevinkte_taken_blijven_behouden(self):
        self.g["afspraken"][1].update(start="2030-01-08T11:00", einde="2030-01-08T12:00")
        self.assertFalse(herplanning.voorstel(self.g, moment=self.nu)["regels"])
        self.g["afspraken"][1].update(start="2030-01-07T11:00", einde="2030-01-07T12:00")
        self.g["taken"].append({"id": 2, "titel": "Ander werk", "deadline": None, "klaar": False, "minuten": 30})
        plan = herplanning.voorstel(self.g, {"1": {"plannen": False}}, moment=self.nu)
        wijziging = herplanning.valideer(plan, self.g, self.nu)
        self.assertFalse(wijziging["vervangt"])
        self.assertTrue(all(i["taak_id"] == 2 for i in wijziging["items"]))

    def test_geen_ruimte_kan_oude_blokken_verwijderen_met_zichtbare_rest(self):
        self.g["afspraken"][0].update(start="2030-01-07T09:00", einde="2030-01-07T18:00")
        plan = herplanning.voorstel(self.g, moment=self.nu)
        self.assertEqual(plan["regels"][0]["rest"], 60)
        wijziging = herplanning.valideer(plan, self.g, self.nu)
        self.assertFalse(wijziging["items"])
        self.assertEqual(len(wijziging["vervangt"]), 1)

    def test_ambigue_uitloop_vraagt_explicitiete_afspraakkeuze(self):
        self.g["afspraken"].append({"id": 12, "titel": "Ook lopend", "start": "2030-01-07T09:45", "einde": "2030-01-07T10:15"})
        with self.assertRaises(dagplan.PlanOngeldig):
            herplanning.voorstel(self.g, uitloop=30, moment=self.nu)

    def test_leeg_resterend_valt_terug_op_taakduur_en_lege_instellingen(self):
        self.g["taken"][0]["resterend_minuten"] = None
        self.g["instellingen"] = None
        self.assertEqual(herplanning.voorstel(self.g, moment=self.nu)["regels"][0]["minuten"], 60)
        self.g["instellingen"] = {"planuren": {"van": "09:00:01", "tot": "18:00"}}
        with self.assertRaises(dagplan.PlanOngeldig):
            herplanning.voorstel(self.g, moment=self.nu)


class HerplanningOpslagTest(unittest.TestCase):
    def setUp(self):
        mapje = tempfile.TemporaryDirectory()
        self.addCleanup(mapje.cleanup)
        for p in (patch.dict(os.environ, ASSISTENT_LOKAAL="1"),
                  patch.object(opslag, "DATA_BESTAND", Path(mapje.name) / "gegevens.json"),
                  patch.object(dagplan, "nu", return_value=datetime(2030, 1, 7, 10))):
            p.start()
            self.addCleanup(p.stop)
        taak = opslag.taak_toevoegen("Belasting", minuten=60)
        opslag.afspraak_toevoegen("Overleg", "2030-01-07T09:30", "2030-01-07T10:30")
        opslag.afspraak_toevoegen("Belasting", "2030-01-07T11:00", "2030-01-07T12:00", taak_id=taak["id"], soort="focus")

    def test_bevestigen_en_ongedaan_herstellen_alle_gegevens(self):
        voor = opslag.laden()
        plan = opslag.herplanvoorstel(uitloop=30)
        ontvangst = opslag.dagplan_bevestigen("herplan", plan)
        self.assertEqual(ontvangst["wat"], "herplan")
        self.assertEqual(opslag.dagplan_bevestigen("herplan", plan), ontvangst)
        self.assertEqual(len(opslag.laden()["afspraken"]), 2)
        antwoord = opslag.intentie_ongedaan("herplan")
        self.assertEqual(antwoord["status"], "ongedaan")
        self.assertEqual(opslag.intentie_ongedaan("herplan"), antwoord)
        self.assertCountEqual(opslag.laden()["afspraken"], voor["afspraken"])
        self.assertEqual(opslag.laden()["taken"], voor["taken"])

    def test_later_aangepaste_taak_blokkeert_terugdraaien(self):
        plan = opslag.herplanvoorstel()
        opslag.dagplan_bevestigen("herplan", plan)
        opslag.taak_bijwerken(opslag.laden()["taken"][0]["id"], titel="Later gewijzigd")
        self.assertEqual(opslag.intentie_ongedaan("herplan")["status"], "gewijzigd")
        self.assertEqual(opslag.laden()["taken"][0]["titel"], "Later gewijzigd")

    def test_netwerkfout_na_schrijven_levert_geen_dubbele_blokken(self):
        plan = opslag.herplanvoorstel()
        echt = opslag.opslaan
        def verlies(g):
            echt(g)
            raise opslag.httpx.ReadTimeout("Antwoord verloren")
        with patch.object(opslag, "opslaan", side_effect=verlies), self.assertRaises(opslag.httpx.ReadTimeout):
            opslag.dagplan_bevestigen("herplan", plan)
        opslag.dagplan_bevestigen("herplan", plan)
        self.assertEqual(len(opslag.laden()["afspraken"]), 2)

    def test_scherm_herberekent_resterende_duur_voor_bevestiging(self):
        from streamlit.testing.v1 import AppTest
        app = AppTest.from_string("import universal_os\nuniversal_os.pagina()").run()
        app.chat_input[0].set_value("Herplan de rest van vandaag").run()
        self.assertFalse(app.exception)
        # Eerste invoer is uitloop, daarna de resterende duur van de taak.
        app.number_input[1].set_value(25)
        app.button(key="herplan_herbereken").click().run()
        self.assertFalse(app.exception)
        self.assertEqual(opslag.laden()["taken"][0].get("resterend_minuten"), None)
        app.button(key="dag_bevestig").click().run()
        self.assertFalse(app.exception)
        self.assertEqual(opslag.laden()["taken"][0]["resterend_minuten"], 25)

    def test_nieuwe_afspraak_blokkeert_onveilig_herstel(self):
        plan = opslag.herplanvoorstel()
        opslag.dagplan_bevestigen("herplan", plan)
        opslag.afspraak_toevoegen("Nieuwe afspraak", "2030-01-07T11:15", "2030-01-07T11:45")
        voor = copy.deepcopy(opslag.laden())
        self.assertEqual(opslag.intentie_ongedaan("herplan")["status"], "gewijzigd")
        self.assertEqual(opslag.laden(), voor)

    def test_scherm_annuleren_en_fout_na_gewijzigde_selectie(self):
        from streamlit.testing.v1 import AppTest
        app = AppTest.from_string("import universal_os\nuniversal_os.pagina()").run()
        voor = copy.deepcopy(opslag.laden())
        app.chat_input[0].set_value("Herplan de rest van vandaag").run()
        app.button(key="dag_annuleer").click().run()
        self.assertEqual(opslag.laden()["afspraken"], voor["afspraken"])
        app.chat_input[0].set_value("Herplan de rest van vandaag").run()
        app.checkbox[0].uncheck()
        app.button(key="dag_bevestig").click().run()
        self.assertFalse(app.exception)
        self.assertTrue(app.error)
        self.assertEqual(opslag.laden()["afspraken"], voor["afspraken"])

    def test_scherm_verloren_antwoord_bevriest_alle_keuzes(self):
        from streamlit.testing.v1 import AppTest
        app = AppTest.from_string("import universal_os\nuniversal_os.pagina()").run()
        app.chat_input[0].set_value("Dit overleg loopt een halfuur uit").run()
        echt = opslag.dagplan_bevestigen
        def verlies(*args):
            echt(*args)
            raise opslag.httpx.ReadTimeout("Antwoord verloren")
        with patch.object(opslag, "dagplan_bevestigen", side_effect=verlies):
            app.button(key="dag_bevestig").click().run()
        self.assertFalse(app.exception)
        self.assertTrue(all(v.disabled for v in app.number_input))
        app.button(key="dag_bevestig").click().run()
        self.assertFalse(app.exception)
        self.assertEqual(len(opslag.laden()["afspraken"]), 2)
