"""Auditstatus, bronvingerafdrukken en leesgereedschap rapporteren eerlijk."""
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from tools import audit_100
from tools.planning_controle import Testresultaat


class GereedschapTest(unittest.TestCase):
    def manifest(self):
        return [{"id": i, "categorie": "Test", "punt": f"Controle {i}", "methode": "test", "bewijs": "voorbeeld.test"} for i in range(1, 91)] + [
            {"id": i, "categorie": "Handmatig", "punt": f"Controle {i}", "methode": "handmatig", "vervolg": "Vereist handmatige controle"} for i in range(91, 101)]

    def test_audit_heeft_precies_honderd_punten_en_open_blijft_open(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "bron.py").write_text("x = 1\n")
            testen = {"formaat": "assistent-tests", "versie": 1, "bronnen": {"bron.py": hashlib.sha256((root / "bron.py").read_bytes()).hexdigest()}, "tests": {"voorbeeld.test": "geslaagd"}}
            r = audit_100.maak_rapport(self.manifest(), testen, root)
            self.assertEqual(r["samenvatting"], {"geslaagd": 90, "open": 10})
            (root / "bron.py").write_text("x = 2\n")
            r = audit_100.maak_rapport(self.manifest(), testen, root)
            self.assertEqual(r["samenvatting"], {"niet_gecontroleerd": 90, "open": 10})

    def test_audit_weigert_ontbrekend_of_dubbel_punt(self):
        for manifest in (self.manifest()[:-1], self.manifest()[:-1] + [self.manifest()[0]]):
            with self.assertRaises(ValueError):
                audit_100.maak_rapport(manifest, {})

    def test_audit_geeft_overgeslagen_bewijs_geen_groene_status(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "bron.py").write_text("pass\n")
            bron = hashlib.sha256((root / "bron.py").read_bytes()).hexdigest()
            r = audit_100.maak_rapport(self.manifest(), {"formaat": "assistent-tests", "versie": 1, "bronnen": {"bron.py": bron}, "tests": {"voorbeeld.test": "overgeslagen"}}, root)
            self.assertEqual(r["samenvatting"], {"overgeslagen": 90, "open": 10})

    def test_json_resultaat_herkent_mislukte_subtest(self):
        class Mislukt(unittest.TestCase):
            def runTest(self):
                with self.subTest(voorbeeld=1):
                    self.assertEqual(1, 2)
        resultaat = unittest.TextTestRunner(stream=io.StringIO(), resultclass=Testresultaat).run(unittest.TestSuite([Mislukt()]))
        self.assertEqual(list(resultaat.details.values()), ["mislukt"])
        self.assertFalse(resultaat.wasSuccessful())

    def test_werkdata_cli_is_leesbaar_en_lekt_geen_inhoud(self):
        root = Path(__file__).parent
        with tempfile.TemporaryDirectory() as d:
            pad = Path(d) / "data.json"
            data = {"taken": [{"id": 1, "titel": "PRIVE-TITEL", "klaar": False, "minuten": -1}], "afspraken": [], "volgend_id": 2, "instellingen": {"token": "GEHEIM"}}
            pad.write_text(json.dumps(data))
            voor = pad.read_bytes()
            r = subprocess.run([sys.executable, str(root / "tools/werkdata_controle.py"), str(pad)], capture_output=True, text=True)
            self.assertEqual(r.returncode, 1)
            self.assertNotIn("GEHEIM", r.stdout)
            self.assertNotIn("PRIVE-TITEL", r.stdout)
            self.assertEqual(pad.read_bytes(), voor)
            r = subprocess.run([sys.executable, str(root / "tools/werkdata_controle.py"), str(pad), "--uitvoer", str(pad)], capture_output=True, text=True)
            self.assertEqual(r.returncode, 2)
            self.assertEqual(pad.read_bytes(), voor)

    def test_omgeving_tool_vindt_ontbrekende_en_conflicterende_pakketten(self):
        from types import SimpleNamespace
        from tools.omgeving_controle import pakketconflicten
        a = SimpleNamespace(metadata={"Name": "App"}, version="1.0", requires=["B>=2", "Ontbreekt>=1", "Extra; extra == 'optioneel'"])
        b = SimpleNamespace(metadata={"Name": "B"}, version="1.0", requires=[])
        r = pakketconflicten([a, b])
        self.assertEqual({m["probleem"] for m in r}, {"ontbreekt", "versieconflict"})
        self.assertNotIn("extra", {m.get("vereist") for m in r})


if __name__ == "__main__":
    unittest.main()
