"""Versiecontrole, begrensde invoer, herstelpreview en atomair toevoegen."""
import copy
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import opslag
import planning_backup as pb


class BackupTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        for p in (patch.dict(os.environ, {"ASSISTENT_LOKAAL": "1"}), patch.object(opslag, "DATA_BESTAND", Path(self.tmp.name) / "data.json")):
            p.start()
            self.addCleanup(p.stop)
        self.g = copy.deepcopy(opslag.LEEG)
        self.g["taken"] = [{"id": 1, "titel": "Eerst", "klaar": True, "deadline": None},
                           {"id": 2, "titel": "Daarna", "klaar": False, "deadline": None, "afhankelijk_van": [1], "minuten": 30}]
        self.g["afspraken"] = [{"id": 3, "titel": "Daarna", "start": "2030-01-07T10:00", "einde": "2030-01-07T10:30", "taak_id": 2, "soort": "focus"}]
        self.g["volgend_id"] = 4
        self.g["sjablonen"] = {"s": {"naam": "Werkdag", "soort": "dagplan"}}
        opslag.opslaan(self.g)
        self.data = pb.exporteer(self.g)

    def bewerkt(self, mutatie):
        r = json.loads(self.data)
        mutatie(r)
        r["sha256"] = pb.vingerafdruk({k: v for k, v in r.items() if k != "sha256"})
        return json.dumps(r).encode()

    def test_roundtrip_en_geen_geheimen_of_bijlagen(self):
        self.g["instellingen"] = {"api_sleutel": "niet-exporteren"}
        self.g["wachtwoord"] = "niet-exporteren"
        self.g["werkbronnen"] = {"s": {"url": "tijdelijk-geheim"}}
        self.g["taken"][0]["bron"] = {"token": "niet-exporteren"}
        data = pb.exporteer(self.g)
        self.assertNotIn(b"niet-exporteren", data)
        self.assertNotIn(b"tijdelijk-geheim", data)
        self.assertEqual(pb.lees(data)["gegevens"]["taken"][1]["afhankelijk_van"], [1])

    def test_controlesom_en_versie(self):
        with self.assertRaisesRegex(ValueError, "controlesom"):
            pb.lees(self.data.replace(b"Eerst", b"Ander"))
        with self.assertRaises(ValueError):
            pb.lees(self.bewerkt(lambda r: r.update(versie=2)))
        with self.assertRaises(ValueError):
            pb.lees(self.bewerkt(lambda r: r.update(versie=True)))

    def test_json_grenzen_en_dubbele_velden(self):
        for data in (b"", b"x" * (pb.MAX_BYTES + 1), b'{"versie":1,"versie":1}', b'{"x":NaN}', b"[" * 1200 + b"]" * 1200, b"\xff"):
            with self.subTest(data=data[:20]), self.assertRaises(ValueError):
                pb.lees(data)

    def test_ongeldige_referenties_cyclus_duur_en_ids(self):
        mutaties = [lambda r: r["gegevens"]["taken"][1].update(afhankelijk_van=[999]),
                    lambda r: r["gegevens"]["taken"][0].update(afhankelijk_van=[2]),
                    lambda r: r["gegevens"]["taken"][1].update(minuten=True),
                    lambda r: r["gegevens"]["taken"][1].update(id=1),
                    lambda r: r["gegevens"]["taken"][1].update(api_sleutel="injectie"),
                    lambda r: r["gegevens"]["afspraken"][0].update(einde="verkeerd")]
        for mutatie in mutaties:
            with self.subTest(mutatie=mutatie), self.assertRaises(ValueError):
                pb.lees(self.bewerkt(mutatie))

    def test_herstel_remapt_en_behield_bestaand(self):
        basis = pb.vingerafdruk(opslag.laden())
        ontvangst = opslag.planning_herstellen("herstel", self.data, basis)
        self.assertEqual(ontvangst, opslag.planning_herstellen("herstel", self.data, basis))
        g = opslag.laden()
        self.assertEqual(g["taken"][:2], self.g["taken"])
        self.assertEqual(len(g["taken"]), 4)
        self.assertEqual(g["taken"][3]["afhankelijk_van"], [g["taken"][2]["id"]])
        self.assertEqual(g["afspraken"][1]["taak_id"], g["taken"][3]["id"])
        self.assertNotEqual(g["afspraken"][0]["id"], g["afspraken"][1]["id"])
        self.assertEqual(len(g["sjablonen"]), 2)

    def test_stale_preview_weigert_schrijven(self):
        basis = pb.vingerafdruk(opslag.laden())
        opslag.taak_toevoegen("Nieuw sinds voorbeeld")
        voor = opslag.laden()
        with self.assertRaisesRegex(ValueError, "voorbeeld"):
            opslag.planning_herstellen("herstel", self.data, basis)
        self.assertEqual(opslag.laden(), voor)

    def test_verloren_antwoord_en_atomische_schrijffout(self):
        basis = pb.vingerafdruk(opslag.laden())
        echt = opslag.opslaan
        def verlies(g):
            echt(g)
            raise opslag.httpx.ReadTimeout("Antwoord verloren")
        with patch.object(opslag, "opslaan", side_effect=verlies), self.assertRaises(opslag.httpx.ReadTimeout):
            opslag.planning_herstellen("herstel", self.data, basis)
        opslag.planning_herstellen("herstel", self.data, basis)
        self.assertEqual(len(opslag.laden()["taken"]), 4)
        voor = opslag.laden()
        with patch.object(opslag, "opslaan", side_effect=OSError("vol")), self.assertRaises(OSError):
            opslag.planning_herstellen("ander", self.data, pb.vingerafdruk(voor))
        self.assertEqual(opslag.laden(), voor)

    def test_voorbeeld_schrijft_niets_en_scherm_vraagt_akkoord(self):
        import streamlit as st
        from streamlit.testing.v1 import AppTest
        upload = io.BytesIO(self.data)
        upload.name = "planning.json"
        voor = opslag.laden()
        with patch.object(st, "file_uploader", return_value=upload):
            app = AppTest.from_string("import planning_backup_scherm\nplanning_backup_scherm.pagina()").run()
            next(b for b in app.button if b.label.startswith("Controleer bestand")).click().run()
            self.assertFalse(app.exception)
            self.assertEqual(opslag.laden(), voor)
            next(b for b in app.button if b.label == "Voeg back-up toe").click().run()
            self.assertTrue(app.error)
            self.assertEqual(opslag.laden(), voor)
            app.checkbox[0].check()
            next(b for b in app.button if b.label == "Voeg back-up toe").click().run()
            self.assertFalse(app.exception)
            self.assertEqual(len(opslag.laden()["taken"]), 4)

    def test_accountwisseling_wist_export_en_voorbeeld(self):
        from streamlit.testing.v1 import AppTest
        app = AppTest.from_string("import planning_backup_scherm\nplanning_backup_scherm.pagina()").run()
        next(b for b in app.button if b.label == "Maak planningback-up").click().run()
        self.assertIn("pb_export_data", app.session_state)
        app.session_state["naam"] = "ander"
        app.run()
        self.assertFalse(app.exception)
        self.assertNotIn("pb_export_data", app.session_state)


if __name__ == "__main__":
    unittest.main()
