"""Regressiecontroles zonder productiegegevens of netwerktoegang."""

import os
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, time
from pathlib import Path
from unittest.mock import patch

import intenties
import opslag


class IntentiesTest(unittest.TestCase):
    def setUp(self):
        self.map = tempfile.TemporaryDirectory()
        self.addCleanup(self.map.cleanup)
        self.pad = Path(self.map.name) / "gegevens.json"
        self.env = patch.dict(os.environ, ASSISTENT_LOKAAL="1")
        self.env.start()
        self.addCleanup(self.env.stop)
        self.bestand = patch.object(opslag, "DATA_BESTAND", self.pad)
        self.bestand.start()
        self.addCleanup(self.bestand.stop)

    def voorstel(self, tekst):
        return intenties.voorstel(tekst, datetime(2026, 10, 27, 12))

    def test_afspraak_en_taak(self):
        afspraak = self.voorstel("Plan overleg morgen om 10:00")["gegevens"]
        self.assertEqual(afspraak["start"], "2026-10-28T10:00")
        self.assertFalse(self.pad.exists())  # herkennen schrijft niets
        opslag.intentie_bevestigen("afspraak", afspraak)
        taak = self.voorstel("Taak belasting vrijdag")["gegevens"]
        opslag.intentie_bevestigen("taak", taak)
        g = opslag.laden()
        self.assertEqual(g["afspraken"][0]["titel"], "Overleg")
        self.assertEqual(g["taken"][0]["deadline"], "2026-10-30")

    def test_betaalopdracht_en_onbekende_tekst_schrijven_niets(self):
        for tekst in ("Betaal -5 euro", "Stuur 1,50 naar studio", "Tip 0"):
            self.assertEqual(self.voorstel(tekst)["soort"], "bericht")
        self.assertEqual(self.voorstel("Waarom?")["soort"], "assistent")
        self.assertEqual(self.voorstel("Plan overleg morgen")["soort"], "vervolg")
        self.assertFalse(self.pad.exists())

    def test_herhaald_bevestigen(self):
        r = self.voorstel("Plan overleg morgen om 10:00")["gegevens"]
        with ThreadPoolExecutor(max_workers=4) as pool:
            antwoorden = list(pool.map(lambda _: opslag.intentie_bevestigen("zelfde", r), range(8)))
        self.assertTrue(all(a == antwoorden[0] for a in antwoorden))
        self.assertEqual(len(opslag.laden()["afspraken"]), 1)
        self.assertEqual(len(opslag.intentie_berichten()), 1)

    def test_opslagfout_geeft_geen_succes(self):
        r = self.voorstel("Taak belasting vrijdag")["gegevens"]
        with patch.object(opslag, "opslaan", side_effect=OSError("schijf vol")):
            with self.assertRaises(OSError):
                opslag.intentie_bevestigen("fout", r)
        self.assertFalse(self.pad.exists())

    def test_chat_bevestigen_annuleren_en_herladen(self):
        from streamlit.testing.v1 import AppTest
        app = AppTest.from_string("import universal_os\nuniversal_os.pagina()", default_timeout=20).run()
        self.assertFalse(app.exception)
        app.chat_input[0].set_value("Plan overleg morgen om 10:00").run()
        self.assertFalse(opslag.laden()["afspraken"])
        app.button(key="os_annuleer").click().run()
        self.assertFalse(opslag.laden()["afspraken"])
        app.chat_input[0].set_value("Taak belasting vrijdag").run()
        app.button(key="os_bevestig").click().run()
        self.assertFalse(app.exception)
        self.assertEqual(len(opslag.laden()["taken"]), 1)
        app.run()
        self.assertEqual(len(opslag.laden()["taken"]), 1)
        self.assertIn("Opgeslagen als taak", opslag.intentie_berichten()[-1]["tekst"])

    def test_voorstel_bewerken(self):
        from streamlit.testing.v1 import AppTest
        app = AppTest.from_string("import universal_os\nuniversal_os.pagina()").run()
        app.chat_input[0].set_value("Plan overleg morgen om 10:00").run()
        app.text_input[0].set_value("Gewijzigd overleg")
        app.text_input[1].set_value("Utrecht")
        app.date_input[0].set_value(date(2026, 11, 5))
        app.date_input[1].set_value(date(2026, 11, 5))
        app.time_input[0].set_value(time(14, 30))
        app.time_input[1].set_value(time(15, 45))
        app.button(key="os_bevestig").click().run()
        self.assertFalse(app.exception)
        item = opslag.laden()["afspraken"][0]
        self.assertEqual((item["titel"], item["locatie"], item["start"], item["einde"]),
                         ("Gewijzigd overleg", "Utrecht", "2026-11-05T14:30", "2026-11-05T15:45"))

    def test_ongeldige_bewerking_blijft_open(self):
        from streamlit.testing.v1 import AppTest
        app = AppTest.from_string("import universal_os\nuniversal_os.pagina()").run()
        app.chat_input[0].set_value("Plan overleg morgen om 10:00").run()
        app.text_input[0].set_value("   ")
        app.button(key="os_bevestig").click().run()
        self.assertTrue(app.error)
        self.assertFalse(app.exception)
        self.assertFalse(opslag.laden()["afspraken"])
        app.text_input[0].set_value("Hersteld")
        app.button(key="os_bevestig").click().run()
        self.assertEqual(opslag.laden()["afspraken"][0]["titel"], "Hersteld")

    def test_verloren_antwoord_geeft_geen_dubbel_item(self):
        from streamlit.testing.v1 import AppTest
        app = AppTest.from_string("import universal_os\nuniversal_os.pagina()").run()
        app.chat_input[0].set_value("Taak belasting vrijdag").run()
        echt = opslag.intentie_bevestigen

        def antwoord_verloren(*args):
            echt(*args)
            raise opslag.httpx.ReadTimeout("Antwoord verloren")

        with patch.object(opslag, "intentie_bevestigen", side_effect=antwoord_verloren):
            app.button(key="os_bevestig").click().run()
        self.assertTrue(app.error)
        self.assertTrue(app.text_input[0].disabled)
        app.button(key="os_bevestig").click().run()
        self.assertFalse(app.exception)
        self.assertEqual(len(opslag.laden()["taken"]), 1)

    def test_taakduur_en_deadline_bewerken(self):
        from streamlit.testing.v1 import AppTest
        app = AppTest.from_string("import universal_os\nuniversal_os.pagina()").run()
        app.chat_input[0].set_value("Taak belasting vrijdag").run()
        app.date_input[0].set_value(date(2026, 11, 6))
        app.number_input[0].set_value(45)
        app.button(key="os_bevestig").click().run()
        self.assertFalse(app.exception)
        self.assertEqual(opslag.laden()["taken"][0]["minuten"], 45)
        self.assertEqual(opslag.laden()["taken"][0]["deadline"], "2026-11-06")

    def test_klokwisseling_en_eindtijd(self):
        for start, einde in (("2027-03-28T02:30", "2027-03-28T04:00"),
                             ("2027-10-31T02:30", "2027-10-31T04:00"),
                             ("2026-11-01T10:00", "2026-11-01T09:00")):
            with self.subTest(start=start), self.assertRaises(ValueError):
                intenties.valideer({"wat": "afspraak", "titel": "Overleg", "start": start, "einde": einde})
        self.assertEqual(intenties.datum_tekst(date(2026, 10, 29), date(2026, 10, 28)),
                         "morgen, donderdag 29 oktober 2026")

    def test_lege_begindatum_geeft_melding(self):
        from streamlit.testing.v1 import AppTest
        app = AppTest.from_string("import universal_os\nuniversal_os.pagina()").run()
        app.chat_input[0].set_value("Plan overleg morgen om 10:00").run()
        app.date_input[0].set_value(None)
        app.button(key="os_bevestig").click().run()
        self.assertFalse(app.exception)
        self.assertTrue(app.error)
        self.assertFalse(opslag.laden()["afspraken"])

    def test_online_conflict_en_ontbrekende_migratie(self):
        with patch.dict(os.environ, ASSISTENT_LOKAAL="0"), patch.object(opslag, "_rpc_ik") as rpc:
            gegevens = opslag._Gegevens(opslag.LEEG, (opslag._naam.get(), opslag._wachtwoord.get()))
            rpc.return_value = {"conflict": True}
            with self.assertRaises(opslag.OpslagConflict):
                opslag.opslaan(gegevens)
            rpc.side_effect = opslag.httpx.HTTPStatusError("missing", request=opslag.httpx.Request("POST", "https://example.invalid"),
                                                          response=opslag.httpx.Response(404))
            with self.assertRaises(opslag.OpslagNietIngericht):
                opslag.opslaan(gegevens)

    def test_vervolgvragen_onthouden_titel_en_datum(self):
        nu = datetime(2026, 10, 28, 12)
        eerste = intenties.routeer("Plan overleg morgen", nu=nu)
        self.assertEqual(eerste["soort"], "vervolg")
        self.assertEqual(eerste["context"]["mist"], "tijd")
        antwoord = intenties.routeer("10:00", eerste["context"], nu=datetime(2026, 10, 29, 12))
        self.assertEqual(antwoord["gegevens"]["titel"], "Overleg")
        self.assertEqual(antwoord["gegevens"]["start"], "2026-10-29T10:00")
        self.assertFalse(self.pad.exists())

    def test_meerdere_vervolgvragen_en_annuleren(self):
        context = None
        for tekst, mist in (("Plan", "titel"), ("Overleg met Jan", "datum"), ("morgen", "tijd")):
            resultaat = intenties.routeer(tekst, context, nu=datetime(2026, 10, 28, 12))
            context = resultaat["context"]
            self.assertEqual(context["mist"], mist)
        self.assertEqual(intenties.routeer("laat maar", context)["soort"], "bericht")
        self.assertFalse(self.pad.exists())

    def test_vragen_en_mail_blijven_naar_ai_gaan(self):
        for tekst in ("Wat kan je?", "Stuur een mail naar Jan", "Stuur 2 mails naar Jan", "Plan mijn trainingen voor deze week"):
            self.assertEqual(intenties.routeer(tekst)["soort"], "assistent")
        self.assertEqual(intenties.routeer("Stuur 1,50 naar studio")["soort"], "bericht")

    def test_ongedaan_herhaalbaar_zonder_opnieuw_toevoegen(self):
        voorstel = self.voorstel("Taak belasting vrijdag")["gegevens"]
        opslag.intentie_bevestigen("undo", voorstel)
        antwoord = opslag.intentie_ongedaan("undo")
        self.assertEqual(antwoord["status"], "ongedaan")
        self.assertEqual(opslag.intentie_ongedaan("undo"), antwoord)
        self.assertTrue(opslag.intentie_bevestigen("undo", voorstel)["ongedaan"])
        self.assertFalse(opslag.laden()["taken"])
        self.assertEqual(len(opslag.intentie_berichten()), 2)

    def test_ongedaan_behoudt_aangepast_item(self):
        ontvangst = opslag.intentie_bevestigen("aangepast", self.voorstel("Taak belasting vrijdag")["gegevens"])
        opslag.taak_bijwerken(ontvangst["id"], titel="Later aangepast")
        self.assertEqual(opslag.intentie_ongedaan("aangepast")["status"], "gewijzigd")
        self.assertEqual(opslag.laden()["taken"][0]["titel"], "Later aangepast")

    def test_ongedaan_behoudt_ingeplande_taak(self):
        ontvangst = opslag.intentie_bevestigen("ingepland", self.voorstel("Taak belasting vrijdag")["gegevens"])
        opslag.afspraak_toevoegen("Focusblok", "2026-10-30T10:00", "2026-10-30T11:00", taak_id=ontvangst["id"])
        self.assertEqual(opslag.intentie_ongedaan("ingepland")["status"], "gewijzigd")
        self.assertEqual(len(opslag.laden()["taken"]), 1)
        self.assertEqual(len(opslag.laden()["afspraken"]), 1)

    def test_ongedaan_verloren_antwoord(self):
        opslag.intentie_bevestigen("undo", self.voorstel("Plan overleg morgen om 10:00")["gegevens"])
        opslaan = opslag.opslaan
        def verlies(gegevens):
            opslaan(gegevens)
            raise opslag.httpx.ReadTimeout("Antwoord verloren")
        with patch.object(opslag, "opslaan", side_effect=verlies), self.assertRaises(opslag.httpx.ReadTimeout):
            opslag.intentie_ongedaan("undo")
        self.assertEqual(opslag.intentie_ongedaan("undo")["status"], "ongedaan")
        self.assertFalse(opslag.laden()["afspraken"])
        self.assertEqual(len(opslag.intentie_berichten()), 2)

    def test_gui_vervolgvraag_en_ongedaan(self):
        from streamlit.testing.v1 import AppTest
        app = AppTest.from_string("import universal_os\nuniversal_os.pagina()").run()
        app.chat_input[0].set_value("Plan overleg morgen").run()
        self.assertEqual(len(app.chat_input), 1)
        self.assertFalse(app.text_input)
        self.assertFalse(opslag.laden()["afspraken"])
        app.chat_input[0].set_value("10:00").run()
        app.button(key="os_bevestig").click().run()
        self.assertEqual(len(opslag.laden()["afspraken"]), 1)
        app.button(key="os_ongedaan").click().run()
        self.assertFalse(app.exception)
        self.assertFalse(opslag.laden()["afspraken"])

    def test_gui_accountwissel_wist_open_context(self):
        from streamlit.testing.v1 import AppTest
        app = AppTest.from_string("import universal_os\nuniversal_os.pagina()").run()
        app.chat_input[0].set_value("Plan overleg morgen").run()
        self.assertIn("_os_vervolg", app.session_state)
        app.session_state.naam = "ander-account"
        app.run()
        self.assertNotIn("_os_vervolg", app.session_state)
        self.assertEqual(app.session_state.chat, [])

    def test_bestaande_assistent_deelt_invoer_met_opdrachten(self):
        from streamlit.testing.v1 import AppTest
        # Laad de echte appfuncties zonder main() en zijn achtergrondkoppelingen.
        # Zo oefenen we het bestaande AI-pad (zonder sleutel) en de centrale invoer.
        bron = '''
import ast
from pathlib import Path
boom = ast.parse(Path("app.py").read_text())
assert isinstance(boom.body[-1], ast.Try)
boom.body.pop()
exec(compile(boom, "app.py", "exec"), globals())
opslag.DATA_BESTAND = Path(os.environ["ASSISTENT_TEST_DATA_FILE"])
persoonlijke_suggesties = lambda: {}
gesprek()
'''
        with patch.dict(os.environ, ASSISTENT_TEST_DATA_FILE=str(self.pad)):
            app = AppTest.from_string(bron, default_timeout=30).run()
            app.chat_input[0].set_value("Wat kun je?").run()
            self.assertFalse(app.exception)
            self.assertIn("Anthropic-sleutel", app.session_state.chat[-1][1])
            app.chat_input[0].set_value("Plan overleg morgen").run()
            self.assertEqual(len(app.chat_input), 1)
            app.chat_input[0].set_value("10:00").run()
            app.button(key="os_bevestig").click().run()
            self.assertFalse(app.exception)
            self.assertEqual(len(opslag.laden()["afspraken"]), 1)
            app.button(key="os_ongedaan").click().run()
            self.assertFalse(opslag.laden()["afspraken"])


if __name__ == "__main__":
    unittest.main()
