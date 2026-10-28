"""Privacygrenzen, opslagherhaling en schermen van communicatie zonder externe AI."""
import copy
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch
import communicatie as cm
import opslag


class CommunicatieTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        for p in (patch.dict(os.environ, {"ASSISTENT_LOKAAL": "1"}),
                  patch.object(opslag, "DATA_BESTAND", Path(self.tmp.name) / "data.json")):
            p.start(); self.addCleanup(p.stop)
        opslag.opslaan(copy.deepcopy(opslag.LEEG))
        self.inhoud = {"kanaal": "E-mail", "ontvanger": "Privé", "onderwerp": "Overleg", "tekst": "Kunnen we overleggen?"}

    def wijzig(self, actie, inhoud, opdracht="a" * 32):
        return cm.wijzigen(opdracht, actie, inhoud, cm.vingerafdruk(cm.lezen()))

    def test_veilige_standaard_en_strikte_invoer(self):
        self.assertFalse(cm.lezen()["voorkeuren"]["ai_hulp"])
        for p in ({"ai_hulp": "nee"}, {"bewaar_dagen": True}, {"onbekend": 1}, {"toon": []}):
            with self.subTest(p=p), self.assertRaises(ValueError):
                cm.voorkeuren(p)
        for tekst in ("", "a\x00b", "x" * 5001, "a\ud800"):
            with self.subTest(tekst=repr(tekst[:10])), self.assertRaises(ValueError):
                cm.concept({**self.inhoud, "tekst": tekst})

    def test_opslaan_en_herhalen_voegt_een_concept_toe(self):
        basis = cm.vingerafdruk(cm.lezen())
        eerste = cm.wijzigen("a" * 32, "bewaren", self.inhoud, basis)
        self.assertEqual(cm.wijzigen("a" * 32, "bewaren", self.inhoud, basis), eerste)
        self.assertEqual(len(cm.lezen()["concepten"]), 1)
        with self.assertRaises(ValueError):
            cm.wijzigen("a" * 32, "bewaren", {**self.inhoud, "tekst": "anders"}, basis)

    def test_verouderd_voorbeeld_overschrijft_niets(self):
        basis = cm.vingerafdruk(cm.lezen())
        self.wijzig("instellingen", {"toon": "Zakelijk"})
        with self.assertRaises(opslag.OpslagConflict):
            cm.wijzigen("b" * 32, "bewaren", self.inhoud, basis)
        self.assertFalse(cm.lezen()["concepten"])

    def test_verloren_antwoord_na_schrijven_wordt_veilig_herhaald(self):
        basis = cm.vingerafdruk(cm.lezen())
        echt = opslag.opslaan
        def verloren(g):
            echt(g)
            raise OSError("Verloren antwoord")
        with patch.object(opslag, "opslaan", side_effect=verloren), self.assertRaises(OSError):
            cm.wijzigen("a" * 32, "bewaren", self.inhoud, basis)
        cm.wijzigen("a" * 32, "bewaren", self.inhoud, basis)
        self.assertEqual(len(cm.lezen()["concepten"]), 1)

    def test_verwijderen_bewaart_geen_berichttekst_in_ontvangst(self):
        self.wijzig("bewaren", self.inhoud)
        self.wijzig("verwijderen", "a" * 32, "b" * 32)
        r = cm.lezen()
        self.assertFalse(r["concepten"])
        self.assertNotIn(self.inhoud["tekst"], json.dumps(r))

    def test_opruimen_is_selectief_en_gebeurt_niet_bij_lezen(self):
        self.wijzig("bewaren", self.inhoud)
        self.wijzig("bewaren", self.inhoud, "b" * 32)
        g = opslag.laden()
        g["communicatie"]["concepten"]["a" * 32]["aangemaakt"] = (datetime.now(timezone.utc) - timedelta(days=40)).isoformat()
        opslag.opslaan(g)
        self.assertEqual(len(cm.lezen()["concepten"]), 2)
        self.assertEqual(self.wijzig("opruimen", None, "c" * 32)["aantal"], 1)
        self.assertEqual(list(cm.lezen()["concepten"]), ["b" * 32])

    def test_export_heeft_geen_andere_accountgegevens(self):
        g = opslag.laden(); g["instellingen"] = {"anthropic_sleutel": "geheim"}; opslag.opslaan(g)
        self.wijzig("bewaren", self.inhoud)
        uit = cm.exporteer(cm.lezen())
        self.assertNotIn("geheim", json.dumps(uit))
        self.assertNotIn("ontvangst", uit)

    def test_beschadigde_conceptstructuur_wordt_niet_overschreven(self):
        g = opslag.laden(); g["communicatie"] = {"concepten": {"a" * 32: {"tekst": "onvolledig"}}}; opslag.opslaan(g)
        with self.assertRaises(ValueError):
            cm.lezen()
        self.assertEqual(opslag.laden(), g)

    def test_ai_vereist_toestemming_en_maskert_voorbeeld(self):
        with self.assertRaises(ValueError):
            cm.ai_voorbeeld("Test", {})
        uit = cm.ai_voorbeeld("Mail test@example.nl of +31 6 1234 5678", {"ai_hulp": True})
        self.assertNotIn("test@example.nl", uit["tekst"])
        self.assertNotIn("1234", uit["tekst"])
        self.assertEqual(set(uit), {"tekst", "toon", "aanspreken"})

    def test_ai_client_krijgt_geen_tools_geheugen_of_profiel(self):
        client = Mock()
        client.messages.create.return_value = SimpleNamespace(content=[SimpleNamespace(type="text", text="Een beter concept.")])
        with patch.object(opslag, "laden", side_effect=AssertionError("Geen accountcontext lezen")):
            self.assertEqual(cm.herschrijven(client, {"tekst": "Controleer dit", "toon": "Zakelijk", "aanspreken": "u"}), "Een beter concept.")
        kwargs = client.messages.create.call_args.kwargs
        self.assertNotIn("tools", kwargs)
        self.assertEqual(kwargs["messages"], [{"role": "user", "content": "Controleer dit"}])

    def test_scherm_bewaart_concept_pas_na_bevestigen(self):
        from streamlit.testing.v1 import AppTest
        app = AppTest.from_string("import communicatie_scherm\ncommunicatie_scherm.pagina()").run()
        self.assertFalse(app.exception)
        app.text_area(key="cm_tekst").set_value("Mijn privéconcept")
        self.assertFalse(cm.lezen()["concepten"])
        next(b for b in app.button if b.label == "Bewaar als privéconcept").click().run()
        self.assertFalse(app.exception)
        self.assertEqual(len(cm.lezen()["concepten"]), 1)
        self.assertTrue(next(b for b in app.button if b.label == "Maak gecontroleerd AI-voorbeeld").disabled)

    def test_onvolledige_ai_uitvoer_wordt_geweigerd(self):
        client = Mock()
        client.messages.create.return_value = SimpleNamespace(content=[SimpleNamespace(type="text", text="Half bericht")], stop_reason="max_tokens")
        with self.assertRaises(ValueError):
            cm.herschrijven(client, {"tekst": "Bericht", "toon": "Neutraal", "aanspreken": "je"})

    def test_assistent_opdracht_en_accountwisseling(self):
        from streamlit.testing.v1 import AppTest
        app = AppTest.from_string('''
import streamlit as st
import universal_os
import communicatie_scherm
universal_os.bewaak_account()
if st.session_state.get("test_opdracht"):
    universal_os.ontvang(st.session_state.pop("test_opdracht"))
communicatie_scherm.pagina()
''').run()
        app.session_state["test_opdracht"] = "schrijf bericht: Goedemorgen"
        app.run()
        self.assertFalse(app.exception)
        self.assertEqual(app.text_area(key="cm_tekst").value, "Goedemorgen")
        self.assertEqual(app.session_state["ga_naar"], "communicatie")
        self.assertFalse(cm.lezen()["concepten"])
        app.session_state["naam"] = "ander-account"
        app.run()
        self.assertFalse(app.exception)
        self.assertEqual(app.text_area(key="cm_tekst").value, "")

    def test_verouderd_formulier_vereist_eerst_herladen(self):
        from streamlit.testing.v1 import AppTest
        app = AppTest.from_string("import communicatie_scherm\ncommunicatie_scherm.pagina()").run()
        app.text_area(key="cm_tekst").set_value("Nog niet bewaard")
        self.wijzig("instellingen", {"toon": "Zakelijk"})
        next(b for b in app.button if b.label == "Bewaar als privéconcept").click().run()
        self.assertFalse(app.exception)
        self.assertFalse(cm.lezen()["concepten"])
        self.assertTrue(any("andere sessie" in w.value for w in app.warning))
        next(b for b in app.button if b.label == "Laad actuele communicatiegegevens").click().run()
        self.assertFalse(app.exception)
        self.assertEqual(app.text_area(key="cm_tekst").value, "")

    def test_schrijfhulp_resultaat_zonder_automatische_opslag(self):
        from streamlit.testing.v1 import AppTest
        import toegang
        self.wijzig("instellingen", {"ai_hulp": True})
        client = Mock()
        client.messages.create.return_value = SimpleNamespace(content=[SimpleNamespace(type="text", text="Herschreven tekst")])
        with patch.object(toegang, "sleutel", return_value="test-only"), patch.object(toegang, "claude", return_value=client):
            app = AppTest.from_string("import communicatie_scherm\ncommunicatie_scherm.pagina()").run()
            app.text_area(key="cm_tekst").set_value("Mail test@example.nl")
            next(b for b in app.button if b.label == "Maak gecontroleerd AI-voorbeeld").click().run()
            client.messages.create.assert_not_called()
            app.checkbox(key="cm_ai_toestemming").check().run()
            next(b for b in app.button if b.label == "Laat assistent dit concept herschrijven").click().run()
            self.assertFalse(app.exception)
            self.assertEqual(client.messages.create.call_count, 1)
            self.assertEqual(app.text_area(key="cm_ai_uitvoer").value, "Herschreven tekst")
            self.assertFalse(cm.lezen()["concepten"])


if __name__ == "__main__":
    unittest.main()
