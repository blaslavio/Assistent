"""Meerdaagse planning schrijft volledig of niets; lokale opslag blijft herstelbaar."""
import copy
from datetime import datetime, timedelta
import os
from pathlib import Path
import stat
import tempfile
import unittest
from unittest.mock import patch
import dagplan
import focusplan
import inplannen
import opslag


class FocusplanTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.pad = Path(self.tmp.name) / "data.json"
        self.nu = datetime(2030, 1, 7, 9)
        for p in (patch.dict(os.environ, {"ASSISTENT_LOKAAL": "1"}), patch.object(opslag, "DATA_BESTAND", self.pad), patch.object(dagplan, "nu", return_value=self.nu)):
            p.start()
            self.addCleanup(p.stop)
        self.g = copy.deepcopy(opslag.LEEG)
        self.g["taken"] = [{"id": i, "titel": f"Taak {i}", "minuten": 60, "deadline": None, "klaar": False} for i in (1, 2)]
        self.g["volgend_id"] = 3
        opslag.opslaan(self.g)
        self.plan = [{"taak_id": 1, "titel": "Taak 1", "deadline": None, "blokken": [{"start": "2030-01-07T10:00", "einde": "2030-01-07T11:00"}]},
                     {"taak_id": 2, "titel": "Taak 2", "deadline": None, "blokken": [{"start": "2030-01-08T10:00", "einde": "2030-01-08T11:00"}]}]

    def test_alle_blokken_in_een_opslagactie(self):
        with patch.object(opslag, "opslaan", wraps=opslag.opslaan) as bewaren:
            self.assertEqual(inplannen.vastleggen(self.plan), 2)
        self.assertEqual(bewaren.call_count, 1)
        self.assertEqual(len(opslag.laden()["afspraken"]), 2)

    def test_fout_in_laatste_blok_bewaart_niets(self):
        self.plan[1]["blokken"][0] = {"start": "2030-01-07T10:30", "einde": "2030-01-07T11:30"}
        voor = opslag.laden()
        with self.assertRaises(ValueError):
            inplannen.vastleggen(self.plan)
        self.assertEqual(opslag.laden(), voor)

    def test_retry_verloren_antwoord_en_undo(self):
        echt = opslag.opslaan
        def verlies(g):
            echt(g)
            raise opslag.httpx.ReadTimeout("Antwoord verloren")
        with patch.object(opslag, "opslaan", side_effect=verlies), self.assertRaises(opslag.httpx.ReadTimeout):
            inplannen.vastleggen(self.plan)
        self.assertEqual(inplannen.vastleggen(self.plan), 2)
        self.assertEqual(len(opslag.laden()["afspraken"]), 2)
        opdracht = next(iter(opslag.laden()["intentie_ontvangst"]))
        opslag.intentie_ongedaan(opdracht)
        self.assertEqual(inplannen.vastleggen(self.plan), 0)
        self.assertEqual(opslag.laden()["afspraken"], [])

    def test_gewijzigde_taakduur_of_nieuwe_afspraak_blokkeert(self):
        g = opslag.laden()
        g["taken"][1]["minuten"] = 15
        opslag.opslaan(g)
        with self.assertRaises(ValueError):
            inplannen.vastleggen(self.plan)
        opslag.opslaan(self.g)
        opslag.afspraak_toevoegen("Overleg", "2030-01-08T10:30", "2030-01-08T11:30")
        with self.assertRaises(ValueError):
            inplannen.vastleggen(self.plan)
        self.assertEqual(len(opslag.laden()["afspraken"]), 1)

    def test_weekend_verleden_en_injectie_worden_geweigerd(self):
        for blok in ({"start": "2030-01-12T10:00", "einde": "2030-01-12T11:00"},
                     {"start": "2030-01-07T08:00", "einde": "2030-01-07T09:00"},
                     {"start": "2030-01-07T10:00", "einde": "2030-01-07T11:00", "wat": "taak"}):
            plan = copy.deepcopy(self.plan)
            plan[0]["blokken"][0] = blok
            with self.subTest(blok=blok), self.assertRaises(ValueError):
                focusplan.valideer(plan, self.g, self.nu)

    def test_oude_planner_ziet_hele_dag_en_utc_als_nederlandse_tijd(self):
        afspraken = [{"start": "2030-01-07"}, {"start": "2030-01-08T09:00:00+00:00", "einde": "2030-01-08T10:00:00+00:00"}]
        with patch.object(opslag, "afspraken_tussen", return_value=afspraken):
            bezet = inplannen._bezet(self.nu.date(), (self.nu + timedelta(days=2)).date())
        self.assertEqual(bezet[0][0], datetime(2030, 1, 6, 23, 50))
        self.assertEqual(bezet[1][0], datetime(2030, 1, 8, 9, 50))

    def test_localeschrijffout_behoudt_oud_bestand_en_ruimt_op(self):
        inhoud = self.pad.read_bytes()
        with patch.object(Path, "replace", side_effect=OSError("vol")), self.assertRaises(OSError):
            opslag.opslaan({**self.g, "test": "nieuw"})
        self.assertEqual(self.pad.read_bytes(), inhoud)
        self.assertFalse(list(self.pad.parent.glob(".gegevens-*.tmp")))
        self.assertEqual(stat.S_IMODE(self.pad.stat().st_mode), 0o600)

    def test_beschadigde_lokale_opslag_geeft_gerichte_fout(self):
        for inhoud in ('{"taken":', '[]', '{"taken":[],"taken":[]}', '{"x":NaN}', '{"afspraken":null}'):
            self.pad.write_text(inhoud)
            with self.subTest(inhoud=inhoud), self.assertRaises(opslag.OpslagBeschadigd):
                opslag.laden()
            self.assertEqual(self.pad.read_text(), inhoud)

    def test_focusopdracht_weigert_andere_inhoud_bij_zelfde_id(self):
        opslag.focusplan_bevestigen("id", self.plan)
        with self.assertRaises(ValueError):
            opslag.focusplan_bevestigen("id", self.plan[:1])


if __name__ == "__main__":
    unittest.main()
