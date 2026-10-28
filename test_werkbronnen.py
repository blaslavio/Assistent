"""Privé bronkoppelingen, autorisatie, retries en de gebruikersstroom."""
import copy
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import bestandsgereedschap
import documenten
import opslag
import werkbronnen


class BronnenTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        for p in (patch.dict(os.environ, {"ASSISTENT_LOKAAL": "1"}), patch.object(opslag, "DATA_BESTAND", Path(self.tmp.name) / "data.json")):
            p.start()
            self.addCleanup(p.stop)
        self.g = copy.deepcopy(opslag.LEEG)
        self.g["taken"] = [{"id": 1, "titel": "Onderzoek", "deadline": None, "klaar": False}]
        self.g["afspraken"] = [{"id": 2, "titel": "Overleg", "start": "2030-01-07T10:00", "einde": "2030-01-07T11:00"}]
        self.g["volgend_id"] = 3
        opslag.opslaan(self.g)
        self.bron = {"soort": "notitie", "titel": "Conclusie", "tekst": "De kosten passen binnen het budget."}

    def test_bronnen_voor_taak_en_afspraak_geen_valse_doelen(self):
        opslag.werkbron_opslaan("taak", "taak", 1, self.bron)
        opslag.werkbron_opslaan("afspraak", "afspraak", 2, self.bron)
        self.assertEqual(len(werkbronnen.overzicht(opslag.laden(), "taak", 1)), 1)
        with self.assertRaises(ValueError):
            opslag.werkbron_opslaan("onbekend", "taak", 999, self.bron)
        self.assertEqual(len(opslag.laden()["werkbronnen"]), 2)

    def test_geen_dubbele_bron_bij_retry_of_zelfde_inhoud(self):
        een = opslag.werkbron_opslaan("een", "taak", 1, self.bron)
        self.assertEqual(een, opslag.werkbron_opslaan("een", "taak", 1, self.bron))
        self.assertEqual(een, opslag.werkbron_opslaan("twee", "taak", 1, self.bron))
        self.assertEqual(len(opslag.laden()["werkbronnen"]), 1)
        with self.assertRaises(ValueError):
            opslag.werkbron_opslaan("een", "taak", 1, {**self.bron, "tekst": "Andere inhoud"})
        opslag.werkbron_verwijderen("een", een)
        for opdracht in ("een", "twee"):
            with self.assertRaisesRegex(ValueError, "verwijderd"):
                opslag.werkbron_opslaan(opdracht, "taak", 1, self.bron)

    def test_verloren_antwoord_blijft_enkelvoudig(self):
        echt = opslag.opslaan
        def verlies(g):
            echt(g)
            raise opslag.httpx.ReadTimeout("Antwoord verloren")
        with patch.object(opslag, "opslaan", side_effect=verlies), self.assertRaises(opslag.httpx.ReadTimeout):
            opslag.werkbron_opslaan("een", "taak", 1, self.bron)
        opslag.werkbron_opslaan("een", "taak", 1, self.bron)
        self.assertEqual(len(opslag.laden()["werkbronnen"]), 1)

    def test_https_geen_actieve_schema_of_credentials(self):
        for url in ("javascript:alert(1)", "file:///tmp/x", "http://site.nl", "https://naam:wachtwoord@site.nl", "https://site.nl/a\nb", "https://site.nl:123/x", "https://site.nl\\@ander.nl", None):
            with self.subTest(url=url), self.assertRaises(ValueError):
                werkbronnen.valideer({"soort": "url", "titel": "Test", "url": url})
        r = werkbronnen.valideer({"soort": "url", "titel": "Bron", "url": "https://example.org/onderzoek?q=1"})
        self.assertEqual(r["url"], "https://example.org/onderzoek?q=1")

    def test_verdwenen_doel_en_explicit_verwijderen_bewaart_document(self):
        bron = opslag.werkbron_opslaan("een", "taak", 1, self.bron)
        opslag.taak_verwijderen(1)
        self.assertTrue(werkbronnen.overzicht(opslag.laden())[0]["doel_ontbreekt"])
        with self.assertRaises(ValueError):
            opslag.werkbron_verwijderen("een", {**bron, "titel": "Verouderd"})
        opslag.werkbron_verwijderen("een", bron)
        opslag.werkbron_verwijderen("een", bron)
        self.assertEqual(opslag.laden()["afspraken"], self.g["afspraken"])

    def test_cloud_lokaal_geweigerd_en_toegang_bij_open_opnieuw(self):
        bron = {"soort": "document", "titel": "Mijn document", "bron_id": 77}
        with self.assertRaises(ValueError):
            opslag.werkbron_opslaan("doc", "taak", 1, bron)
        with patch.object(opslag, "online", return_value=True), patch.object(documenten, "lezen", return_value={"titel": "Mijn document", "tekst": "Broninhoud"}) as lezen:
            werkbronnen.controleer_cloud(bron)
            self.assertEqual(werkbronnen.cloud_openen(bron)["tekst"], "Broninhoud")
            self.assertEqual(lezen.call_count, 2)
            lezen.side_effect = documenten.Fout("Geen toegang")
            with self.assertRaises(documenten.Fout):
                werkbronnen.cloud_openen(bron)

    def test_geen_downloadurl_in_cloudkoppeling(self):
        bron = {"soort": "bestand", "titel": "Video", "bron_id": 5, "url": "tijdelijke-geheime-link"}
        with patch.object(werkbronnen, "controleer_cloud") as controle:
            r = opslag.werkbron_opslaan("video", "afspraak", 2, bron)
        self.assertNotIn("url", r)
        self.assertEqual(controle.call_args.args[0], {"soort": "bestand", "titel": "Video", "bron_id": 5})

    def test_scherm_notitie_koppelen_zoeken_en_veilige_verwijdering(self):
        from streamlit.testing.v1 import AppTest
        app = AppTest.from_string("import werkbronnen_scherm\nwerkbronnen_scherm.pagina()").run()
        self.assertFalse(app.exception)
        next(i for i in app.text_input if i.label == "Titel van de koppeling").set_value("Onderzoeksresultaat")
        app.text_area[0].set_value("Alles gecontroleerd.")
        self.assertFalse(opslag.laden().get("werkbronnen"))
        next(b for b in app.button if b.label == "Bron koppelen").click().run()
        self.assertFalse(app.exception)
        self.assertEqual(len(opslag.laden()["werkbronnen"]), 1)
        next(i for i in app.text_input if i.label == "Zoek op bron of taak/afspraak").set_value("onvindbaar").run()
        self.assertTrue(any(c.value == "0 bronnen gevonden" for c in app.caption))
        next(i for i in app.text_input if i.label == "Zoek op bron of taak/afspraak").set_value("").run()
        knop = next(b for b in app.button if b.label == "Verwijder koppeling")
        self.assertTrue(knop.disabled)
        app.checkbox[0].check().run()
        next(b for b in app.button if b.label == "Verwijder koppeling").click().run()
        self.assertFalse(app.exception)
        self.assertEqual(opslag.laden()["werkbronnen"], {})

    def test_csv_samenvatting_zonder_ruwe_rijen_en_accountwisseling(self):
        from streamlit.testing.v1 import AppTest
        app = AppTest.from_string('''
import werkbronnen_scherm
import bestandsgereedschap
r = bestandsgereedschap.analyseer_csv("omzet.csv", b"bedrag\\n1\\n2\\n")
werkbronnen_scherm.csv_koppelen(r)
''').run()
        app.checkbox[0].check().run()
        next(b for b in app.button if b.label == "Bewaar deze analysesamenvatting").click().run()
        self.assertFalse(app.exception)
        bron = next(iter(opslag.laden()["werkbronnen"].values()))
        self.assertIn('"rijen": 2', bron["tekst"])
        self.assertNotIn("voorbeeld", bron["tekst"])
        app.session_state["naam"] = "ander"
        app.run()
        self.assertFalse(app.checkbox[0].value)


if __name__ == "__main__":
    unittest.main()
