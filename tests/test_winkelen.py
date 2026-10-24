"""Mandje-regressietests zonder database of betaalprovider."""
import importlib
import sys
import types
import unittest


class MandjeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.orig = {n: sys.modules.get(n) for n in ("opslag", "samen", "winkelkaart", "winkelen")}
        opslag = types.ModuleType("opslag")
        cls.state = {"mandje": {}}
        opslag.instellingen = lambda: cls.state
        opslag.instellingen_bijwerken = lambda **kw: cls.state.update(kw)
        samen = types.ModuleType("samen")
        samen.Fout = type("Fout", (Exception,), {})
        sys.modules.update({"opslag": opslag, "samen": samen, "winkelkaart": types.ModuleType("winkelkaart")})
        sys.modules.pop("winkelen", None)
        cls.mod = importlib.import_module("winkelen")
        cls.Fout = samen.Fout

    @classmethod
    def tearDownClass(cls):
        for n, v in cls.orig.items():
            if v is None:
                sys.modules.pop(n, None)
            else:
                sys.modules[n] = v

    def setUp(self):
        self.state["mandje"] = {}

    def test_twee_winkels_en_subtotaal(self):
        product = {"id": 7, "titel": "Brood", "prijs": 2.5}
        self.mod.in_mandje("A", "Winkel A", product, 2)
        self.mod.in_mandje("B", "Winkel B", product, 1)
        self.assertEqual(self.mod.subtotaal("A"), 5)
        self.assertEqual(self.mod.aantal_in_mandje(), 3)
        self.mod.aantal_zetten("A", 7, 0)
        self.assertEqual(self.mod.subtotaal("A"), 0)

    def test_ongeldige_aantallen(self):
        for aantal in (0, -1, True, 1.5):
            with self.subTest(aantal=aantal), self.assertRaises(self.Fout):
                self.mod.in_mandje("A", "Winkel", {"id": 1, "titel": "Item", "prijs": 1}, aantal)
        self.assertEqual(self.mod.aantal_in_mandje(), 0)

    def test_ongeldige_prijzen(self):
        for prijs in (-1, float("nan"), float("inf")):
            with self.subTest(prijs=prijs), self.assertRaises(self.Fout):
                self.mod.in_mandje("A", "Winkel", {"id": 1, "titel": "Item", "prijs": prijs})
        self.assertEqual(self.state["mandje"], {})


if __name__ == "__main__":
    unittest.main()
