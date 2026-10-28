"""De echte tegels, navigatie, voorkeuren en toolfinder via Streamlit."""
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).parent


class InterfaceSchermTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(dir="/tmp")
        self.addCleanup(self.tmp.cleanup)
        p = patch.dict(os.environ, {"ASSISTENT_LOKAAL": "1", "ASSISTENT_INTERFACE_DATA": str(Path(self.tmp.name) / "data.json")})
        p.start()
        self.addCleanup(p.stop)
        import opslag
        huidig = opslag.DATA_BESTAND
        self.addCleanup(lambda: setattr(opslag, "DATA_BESTAND", huidig))

    def test_alle_mappen_en_gedeelde_tools_zijn_zichtbaar(self):
        from streamlit.testing.v1 import AppTest
        os.environ["ASSISTENT_INTERFACE_PAGINA"] = "instellingen"
        app = AppTest.from_file(str(ROOT / "tools/interface_lokaal.py")).run()
        self.assertFalse(app.exception)
        for naam in ("Kopen en verkopen", "Afspreken", "Leren en werk", "Geld", "Zakelijk", "Sport en gezondheid", "Thuis en handig"):
            self.assertTrue(any(naam in m.value for m in app.markdown), naam)
        self.assertTrue(any("online account" in c.value for c in app.caption))

    def test_toolfinder_filtert_zonder_instelingen_te_wijzigen(self):
        import opslag
        from streamlit.testing.v1 import AppTest
        os.environ["ASSISTENT_INTERFACE_PAGINA"] = "gereedschappen"
        app = AppTest.from_file(str(ROOT / "tools/interface_lokaal.py")).run()
        self.assertFalse(app.exception)
        voor = opslag.laden()
        app.text_input(key="gt_zoek").set_value("planning backup").run()
        self.assertTrue(any("1 van" in c.value for c in app.caption))
        self.assertEqual(opslag.laden(), voor)
        app.text_input(key="gt_zoek").set_value("onvindbaretest").run()
        self.assertTrue(app.info)
        app.session_state["naam"] = "andere-test"
        app.run()
        self.assertEqual(app.text_input(key="gt_zoek").value, "")

    def test_voorkeuren_bevatten_nieuwe_gereedschappen(self):
        from streamlit.testing.v1 import AppTest
        os.environ["ASSISTENT_INTERFACE_PAGINA"] = "instellingen"
        app = AppTest.from_file(str(ROOT / "tools/interface_lokaal.py")).run()
        self.assertFalse(app.exception)
        favorieten = app.multiselect(key="indeling_favorieten")
        self.assertIn("Alle gereedschappen", favorieten.options)
        self.assertIn("Planningback-up en herstel", favorieten.options)
        favorieten.set_value(["werkzoeken", "gereedschappen"]).run()
        self.assertFalse(app.exception)
        import opslag
        self.assertEqual(opslag.instellingen()["indeling"]["favorieten"], ["werkzoeken", "gereedschappen"])

    def test_interface_rapport_gebruikt_geen_verouderd_bewijs(self):
        import hashlib
        from tools.interface_controle import maak_rapport
        from test_interface import SCENARIOS
        root = Path(self.tmp.name)
        (root / "bron.py").write_text("pass")
        rapport = {"formaat": "assistent-tests", "versie": 1,
                   "bronnen": {"bron.py": hashlib.sha256((root / "bron.py").read_bytes()).hexdigest()},
                   "tests": {s["test"]: "geslaagd" for s in SCENARIOS}}
        r = maak_rapport(rapport, root=root)
        self.assertEqual(r["samenvatting"], {"geslaagd": 1000})
        self.assertFalse(r["browser_gecontroleerd"])
        (root / "bron.py").write_text("gewijzigd")
        self.assertEqual(maak_rapport(rapport, root=root)["samenvatting"], {"niet_gecontroleerd": 1000})

    def test_browserbewijs_zonder_scenarios_wordt_niet_geaccepteerd(self):
        from tools.interface_controle import maak_rapport
        r = maak_rapport({"formaat": "assistent-tests", "versie": 1, "bronnen": {}, "tests": {}}, {"formaat": "assistent-browsercontrole", "broncode_actueel": True, "scenarios": []})
        self.assertFalse(r["browser_gecontroleerd"])


if __name__ == "__main__":
    unittest.main()
