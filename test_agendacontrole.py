"""Overlap, bruikbare alternatieven en opnieuw controleren bij bevestigen."""

import os
import tempfile
import unittest
from datetime import date, datetime, time, timedelta
from pathlib import Path
from unittest.mock import patch

import agendacontrole
import opslag


class AgendaControleTest(unittest.TestCase):
    def setUp(self):
        self.voorstel = {"wat": "afspraak", "titel": "Overleg", "start": "2030-01-07T10:00", "einde": "2030-01-07T11:00"}
        self.nu = datetime(2030, 1, 7, 8)

    def controle(self, afspraken, **extra):
        return agendacontrole.controleer(self.voorstel, afspraken, nu=self.nu, **extra)

    def test_aansluiten_is_geen_overlap(self):
        afspraken = [{"start": "2030-01-07T09:00", "einde": "2030-01-07T10:00"},
                     {"start": "2030-01-07T11:00", "einde": "2030-01-07T12:00"}]
        self.assertFalse(self.controle(afspraken)["conflicten"])

    def test_deels_geheel_en_meerdaags_overlappen(self):
        for begin, einde in (("2030-01-07T09:30", "2030-01-07T10:30"),
                             ("2030-01-07T10:15", "2030-01-07T10:30"),
                             ("2030-01-06T23:00", "2030-01-07T12:00")):
            with self.subTest(begin=begin):
                self.assertEqual(len(self.controle([{"start": begin, "einde": einde}])["conflicten"]), 1)

    def test_hele_dag_en_tijdzone(self):
        for afspraak in ({"start": "2030-01-07"}, {"start": "2030-01-07T09:00:00Z", "einde": "2030-01-07T10:00:00Z"},
                        {"start": "2030-01-07T09:30"}):
            with self.subTest(afspraak=afspraak):
                self.assertTrue(self.controle([afspraak])["conflicten"])

    def test_onleesbare_afspraak_blokkeert_vrije_claim(self):
        with self.assertRaises(agendacontrole.ControleOnvolledig):
            self.controle([{"start": "ongeldig"}])

    def test_alternatieven_behouden_duur_en_planuren(self):
        self.voorstel["einde"] = "2030-01-07T11:30"
        bezet = [{"start": "2030-01-07T09:00", "einde": "2030-01-07T12:00"}]
        alternatieven = self.controle(bezet, uren={"van": "09:00", "tot": "16:00"})["alternatieven"]
        self.assertEqual(len(alternatieven), 3)
        self.assertEqual(alternatieven[0]["start"], "2030-01-07T12:00")
        for voorstel in alternatieven:
            begin, einde = datetime.fromisoformat(voorstel["start"]), datetime.fromisoformat(voorstel["einde"])
            self.assertEqual(einde - begin, timedelta(minutes=90))
            self.assertTrue(time(9) <= begin.time() < einde.time() <= time(16))
            self.assertFalse(agendacontrole.controleer(voorstel, bezet, nu=self.nu)["conflicten"])

    def test_volle_week_geeft_geen_suggesties(self):
        self.assertFalse(self.controle([{"start": "2030-01-07", "einde": "2030-01-14"}])["alternatieven"])

    def test_ongeldige_planuren_en_weekend(self):
        self.assertIn("melding", self.controle([self.voorstel], uren="ongeldig"))
        self.assertIn("melding", self.controle([self.voorstel], uren={"van": "18:00", "tot": "09:00"}))
        self.voorstel.update(start="2030-01-12T10:00", einde="2030-01-12T11:00")  # zaterdag
        self.assertFalse(self.controle([self.voorstel])["alternatieven"][0]["start"].startswith("2030-01-12"))
        self.assertTrue(self.controle([self.voorstel], uren={"weekend": True})["alternatieven"][0]["start"].startswith("2030-01-12"))


class AgendaSchermTest(unittest.TestCase):
    def setUp(self):
        mapje = tempfile.TemporaryDirectory()
        self.addCleanup(mapje.cleanup)
        self.patch_env = patch.dict(os.environ, ASSISTENT_LOKAAL="1")
        self.patch_env.start()
        self.addCleanup(self.patch_env.stop)
        self.patch_pad = patch.object(opslag, "DATA_BESTAND", Path(mapje.name) / "gegevens.json")
        self.patch_pad.start()
        self.addCleanup(self.patch_pad.stop)

    def scherm(self):
        from streamlit.testing.v1 import AppTest
        return AppTest.from_string("import universal_os\nuniversal_os.pagina()", default_timeout=30).run()

    def test_alternatief_is_eerst_een_voorstel(self):
        opslag.afspraak_toevoegen("Bestaand overleg", "2030-01-07T10:00", "2030-01-07T11:00")
        app = self.scherm()
        app.chat_input[0].set_value("Plan overleg 7/1/2030 om 10:00").run()
        self.assertTrue(app.warning)
        keuze = next(b for b in app.button if b.key.startswith("os_alternatief_"))
        keuze.click().run()
        self.assertEqual(len(opslag.laden()["afspraken"]), 1)
        app.button(key="os_bevestig").click().run()
        self.assertFalse(app.exception)
        self.assertEqual(len(opslag.laden()["afspraken"]), 2)

    def test_tussentijds_toegevoegde_afspraak_weigert_opslaan(self):
        app = self.scherm()
        app.chat_input[0].set_value("Plan overleg 7/1/2030 om 10:00").run()
        opslag.afspraak_toevoegen("Net toegevoegd", "2030-01-07T10:00", "2030-01-07T11:00")
        app.button(key="os_bevestig").click().run()
        self.assertFalse(app.exception)
        self.assertEqual(len(opslag.laden()["afspraken"]), 1)
        self.assertTrue(app.warning)
        self.assertFalse(app.text_input[0].disabled)
        self.assertFalse(opslag.laden().get("intentie_ontvangst"))

    def test_bewerkte_tijden_worden_gecontroleerd(self):
        opslag.afspraak_toevoegen("Middagafspraak", "2030-01-07T14:00", "2030-01-07T15:00")
        app = self.scherm()
        app.chat_input[0].set_value("Plan overleg 7/1/2030 om 10:00").run()
        app.text_input[0].set_value("Gewijzigd overleg")
        app.time_input[0].set_value(time(14))
        app.time_input[1].set_value(time(14, 45))
        app.button(key="os_controleer").click().run()
        self.assertFalse(app.exception)
        self.assertTrue(app.warning)
        next(b for b in app.button if b.key.startswith("os_alternatief_")).click().run()
        self.assertEqual(app.text_input[0].value, "Gewijzigd overleg")
        app.button(key="os_bevestig").click().run()
        bewaard = opslag.laden()["afspraken"][-1]
        self.assertEqual(datetime.fromisoformat(bewaard["einde"]) - datetime.fromisoformat(bewaard["start"]), timedelta(minutes=45))

    def test_verouderde_keuze_wordt_niet_stilzwijgend_andere_tijd(self):
        opslag.afspraak_toevoegen("Bestaand", "2030-01-07T10:00", "2030-01-07T11:00")
        app = self.scherm()
        app.chat_input[0].set_value("Plan overleg 7/1/2030 om 10:00").run()
        oude_keuze = next(b for b in app.button if b.key.startswith("os_alternatief_"))
        self.assertIn("11:00", oude_keuze.label)
        opslag.afspraak_toevoegen("Intussen bezet", "2030-01-07T11:00", "2030-01-07T12:00")
        oude_keuze.click().run()
        self.assertFalse(app.exception)
        self.assertEqual(app.time_input[0].value, time(10))
        self.assertEqual(len(opslag.laden()["afspraken"]), 2)


if __name__ == "__main__":
    unittest.main()
