"""Conceptlinks, centbedragen, verval, intrekken en sessiegedrag zonder externe diensten."""

from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import actielinks
import intenties
import opslag


class ParserTest(unittest.TestCase):
    def test_prijs_en_geldigheid_worden_niet_verwisseld(self):
        r = intenties.routeer("Maak link voor PT sessie van 45 euro geldig voor 2 dagen")
        self.assertEqual(r["soort"], "actielink")
        self.assertEqual(r["gegevens"], {"titel": "PT sessie", "prijs_cent": 4500, "uren": 48})

    def test_sessieduur_is_geen_automatische_geldigheid(self):
        r = actielinks.voorstel("Maak link voor training van 1 uur van 45 euro")
        self.assertEqual(r["uren"], 24)
        self.assertIn("1 uur", r["titel"])
        self.assertEqual(r["prijs_cent"], 4500)

    def test_geen_verzonnen_prijs_en_geen_brede_trefwoordrouting(self):
        self.assertIsNone(actielinks.voorstel("Maak link voor training")["prijs_cent"])
        for tekst in ("Deel dit bestand via een link", "Wat betekent hyperlink?", "Welke acties staan gepland?"):
            self.assertIsNone(actielinks.voorstel(tekst))

    def test_onjuiste_prijzen_en_geldigheid_worden_geweigerd(self):
        for tekst in ("Maak link voor training van -5 euro", "Maak link voor training €1e3", "Maak link voor training 45,123 euro",
                      "Maak link voor training 45 euro geldig voor 0 uur", "Maak link voor training 45 euro voor -2 dagen",
                      "Maak link voor training 45 euro geldig voor 8 dagen"):
            with self.subTest(tekst=tekst), self.assertRaises(actielinks.Fout):
                actielinks.voorstel(tekst)
        self.assertEqual(actielinks.prijs_cent("0,29"), 29)

    def test_geldigheid_op_exacte_grens(self):
        nu = datetime(2030, 1, 7, 10, tzinfo=timezone.utc)
        link = actielinks.maak({"titel": "Training", "prijs_cent": 4500, "uren": 2}, "a" * 32, nu)
        self.assertEqual(actielinks.status(link, nu + timedelta(hours=2) - timedelta(microseconds=1)), "actief concept")
        self.assertEqual(actielinks.status(link, nu + timedelta(hours=2)), "verlopen")
        self.assertEqual(actielinks.verwijzing(link["code"]), "?actie=" + "a" * 32)


class OpslagTest(unittest.TestCase):
    def setUp(self):
        self.mapje = tempfile.TemporaryDirectory()
        self.addCleanup(self.mapje.cleanup)
        self.nu = datetime(2030, 1, 7, 10, tzinfo=timezone.utc)
        for p in (patch.dict(os.environ, ASSISTENT_LOKAAL="1"),
                  patch.object(opslag, "DATA_BESTAND", Path(self.mapje.name) / "gegevens.json"),
                  patch.object(actielinks, "nu", return_value=self.nu)):
            p.start()
            self.addCleanup(p.stop)
        self.voorstel = {"titel": "Training", "prijs_cent": 4500, "uren": 2}

    def test_opslaan_opnieuw_openen_vervallen_en_intrekken(self):
        link = opslag.actielink_opslaan("zelfde", self.voorstel)
        self.assertEqual(opslag.actielink_opslaan("zelfde", self.voorstel), link)
        self.assertEqual(opslag.actielink_openen(link["code"]), link)
        with patch.object(actielinks, "nu", return_value=self.nu + timedelta(hours=2)), self.assertRaises(actielinks.Fout):
            opslag.actielink_openen(link["code"])
        opslag.actielink_intrekken(link["code"])
        opslag.actielink_intrekken(link["code"])
        with self.assertRaises(actielinks.Fout):
            opslag.actielink_openen(link["code"])
        self.assertEqual(len(opslag.laden()["actielinks"]), 1)

    def test_verloren_antwoord_verlengt_geldigheid_niet(self):
        echt = opslag.opslaan
        def verlies(g):
            echt(g)
            raise opslag.httpx.ReadTimeout("Antwoord verloren")
        with patch.object(opslag, "opslaan", side_effect=verlies), self.assertRaises(opslag.httpx.ReadTimeout):
            opslag.actielink_opslaan("zelfde", self.voorstel)
        with patch.object(actielinks, "nu", return_value=self.nu + timedelta(minutes=15)):
            link = opslag.actielink_opslaan("zelfde", self.voorstel)
        self.assertEqual(datetime.fromisoformat(link["vervalt"]), self.nu + timedelta(hours=2))
        self.assertEqual(len(opslag.laden()["actielinks"]), 1)

    def test_onbekende_link_en_schrijffout(self):
        with self.assertRaises(actielinks.Fout):
            opslag.actielink_openen("a" * 32)
        with patch.object(opslag, "opslaan", side_effect=OSError("schijf vol")), self.assertRaises(OSError):
            opslag.actielink_opslaan("fout", self.voorstel)
        self.assertFalse(opslag.laden().get("actielinks"))

    def test_centrale_router_boekt_linkprijs_niet_als_uitgave(self):
        from streamlit.testing.v1 import AppTest
        bron = '''
import ast
from pathlib import Path
import streamlit as st
import actielinks
import universal_os
boom = ast.parse(Path("app.py").read_text())
functies = [n for n in boom.body if isinstance(n, ast.FunctionDef) and n.name == "assistent_opdracht"]
exec(compile(ast.Module(body=functies, type_ignores=[]), "app.py", "exec"), globals())
def snel_uitgave(tekst):
    st.session_state.uitgave_gebruikt = True
    return True
if vraag := st.chat_input("Opdracht"):
    assistent_opdracht(vraag)
universal_os.paneel()
'''
        app = AppTest.from_string(bron).run()
        app.chat_input[0].set_value("Maak link voor PT sessie van 45 euro").run()
        self.assertFalse(app.exception)
        self.assertNotIn("uitgave_gebruikt", app.session_state)
        self.assertEqual(app.text_input[1].value, "45,00")

    def test_scherm_bewerken_en_pas_na_bevestiging_opslaan(self):
        from streamlit.testing.v1 import AppTest
        app = AppTest.from_string("import universal_os\nuniversal_os.pagina()").run()
        app.chat_input[0].set_value("Maak link voor training van 45 euro geldig voor 2 uur").run()
        self.assertFalse(app.exception)
        self.assertFalse(opslag.laden().get("actielinks"))
        app.text_input[1].set_value("49,95")
        app.button(key="al_bevestig").click().run()
        self.assertFalse(app.exception)
        link = next(iter(opslag.laden()["actielinks"].values()))
        self.assertEqual(link["prijs_cent"], 4995)
        app.run()
        self.assertFalse(app.exception)
        self.assertEqual(len(opslag.laden()["actielinks"]), 1)

    def test_scherm_verloren_antwoord_en_intrekken(self):
        from streamlit.testing.v1 import AppTest
        app = AppTest.from_string("import actielinks_scherm\nactielinks_scherm.pagina()").run()
        app.button(key="al_nieuw").click().run()
        app.text_input[0].set_value("Training")
        app.text_input[1].set_value("45,00")
        echt = opslag.actielink_opslaan
        def verlies(*args):
            echt(*args)
            raise opslag.httpx.ReadTimeout("Antwoord verloren")
        with patch.object(opslag, "actielink_opslaan", side_effect=verlies):
            app.button(key="al_bevestig").click().run()
        self.assertFalse(app.exception)
        self.assertTrue(app.error)
        self.assertTrue(app.text_input[0].disabled)
        app.button(key="al_bevestig").click().run()
        self.assertFalse(app.exception)
        code = next(iter(opslag.laden()["actielinks"]))
        app.button(key="al_intrekken_" + code).click().run()
        self.assertFalse(app.exception)
        with self.assertRaises(actielinks.Fout):
            opslag.actielink_openen(code)


if __name__ == "__main__":
    unittest.main()
