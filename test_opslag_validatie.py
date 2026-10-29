"""Opslaggrenzen blijven geldig met Python -O; verplaatsen is één bevestigde wijziging."""
import copy
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch
import opslag


class OpslagValidatieTest(unittest.TestCase):
    def test_onbekende_lijsten_worden_geweigerd_voor_lezen_of_schrijven(self):
        with patch.object(opslag, "laden") as lezen, patch.object(opslag, "opslaan") as schrijven:
            for naam in ("instellingen", "taken", "", None, []):
                for functie, args in ((opslag.lijst, ()), (opslag.lijst_toevoegen, ()), (opslag.lijst_bijwerken, (1,)), (opslag.lijst_weg, (1,))):
                    with self.subTest(functie=functie.__name__, soort=type(naam).__name__), self.assertRaises(ValueError):
                        functie(naam, *args)
            lezen.assert_not_called()
            schrijven.assert_not_called()

    def test_ongeldige_namens_voorkeur_schrijft_niets(self):
        with patch.object(opslag, "instellingen_bijwerken") as schrijven:
            for kanaal, keuze in (("mail", "altijd"), ("onbekend", "zelf"), (None, "vragen"), ("mail", [])):
                with self.subTest(kanaal=kanaal), self.assertRaises(ValueError):
                    opslag.namens_instellen(kanaal, keuze)
            schrijven.assert_not_called()

    def test_validatie_werkt_ook_in_geoptimaliseerde_python(self):
        code = '''
import opslag
from unittest.mock import patch
with patch.object(opslag, "laden") as lezen, patch.object(opslag, "instellingen_bijwerken") as schrijven:
    for f in (lambda:opslag.lijst("instellingen"),lambda:opslag.namens_instellen("mail","altijd")):
        try:f()
        except ValueError:pass
        else:raise SystemExit("validatie_verdwenen_met_optimalisatie")
    if lezen.called or schrijven.called:raise SystemExit("onverwachte_opslagaanroep")
'''
        r = subprocess.run([sys.executable, "-O", "-c", code], cwd=Path(__file__).parent, capture_output=True, text=True, timeout=20)
        self.assertEqual(r.returncode, 0, "De geoptimaliseerde validatieproef faalde.")

    def test_verplaatsen_controleert_beide_lijsten_voordat_er_iets_verandert(self):
        g = {"kooplijst": [{"id": 1, "titel": "Voorbeeld"}], "volgend_id": 2}
        origineel = copy.deepcopy(g)
        with patch.object(opslag, "laden", return_value=g), patch.object(opslag, "opslaan") as schrijven:
            with self.assertRaises(ValueError):
                opslag.verplaatsen("kooplijst", "onbekend", 1)
            schrijven.assert_not_called()
            self.assertEqual(g, origineel)

    def test_verplaatsen_bewaart_een_snapshot_en_een_schrijfvoorwaarde(self):
        g = opslag._Gegevens({"kooplijst": [{"id": 1, "titel": "Voorbeeld", "notitie": "Bewaren"}], "wenslijst": [], "volgend_id": 2}, ("synthetisch", "test"))
        origineel = copy.deepcopy(g)
        with patch.object(opslag, "laden", return_value=g), patch.object(opslag, "opslaan") as schrijven:
            opslag.verplaatsen("kooplijst", "wenslijst", 1)
            schrijven.assert_called_once()
            nieuw = schrijven.call_args.args[0]
            self.assertEqual(nieuw["kooplijst"], [])
            self.assertEqual(nieuw["wenslijst"][0]["notitie"], "Bewaren")
            self.assertEqual(nieuw.account, g.account)
            self.assertEqual(nieuw.basis, g.basis)
            self.assertEqual(g, origineel)

    def test_verplaatsen_bij_opslagfout_verliest_geen_bronitem(self):
        g = {"kooplijst": [{"id": 1, "titel": "Voorbeeld"}], "wenslijst": [], "volgend_id": 2}
        origineel = copy.deepcopy(g)
        with patch.object(opslag, "laden", return_value=g), patch.object(opslag, "opslaan", side_effect=opslag.OpslagConflict("conflict")):
            with self.assertRaises(opslag.OpslagConflict):
                opslag.verplaatsen("kooplijst", "wenslijst", 1)
            self.assertEqual(g, origineel)

    def test_verplaatsen_naar_dezelfde_lijst_schrijft_niets(self):
        with patch.object(opslag, "laden") as lezen, patch.object(opslag, "opslaan") as schrijven:
            opslag.verplaatsen("kooplijst", "kooplijst", 1)
            lezen.assert_not_called()
            schrijven.assert_not_called()

    def test_geldige_lijstbewerkingen_blijven_werken(self):
        g = {"notities": [], "volgend_id": 1}
        with patch.object(opslag, "laden", return_value=g), patch.object(opslag, "opslaan"):
            item = opslag.lijst_toevoegen("notities", titel="Voorbeeld")
            self.assertEqual(opslag.lijst("notities"), [item])
            opslag.lijst_bijwerken("notities", item["id"], titel="Bijgesteld")
            self.assertEqual(g["notities"][0]["titel"], "Bijgesteld")
            opslag.lijst_weg("notities", item["id"])
            self.assertEqual(g["notities"], [])

    def test_geldige_namens_voorkeur_behoudt_het_andere_kanaal(self):
        with patch.object(opslag, "instellingen", return_value={"namens": {"berichten": "bekenden"}}), patch.object(opslag, "instellingen_bijwerken") as schrijven:
            opslag.namens_instellen("mail", "vragen")
            schrijven.assert_called_once_with(namens={"berichten": "bekenden", "mail": "vragen"})
