"""Gerichte regressies voor de werkelijk aangetroffen fouten en nieuwe grenzen."""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, Inexact, localcontext
from pathlib import Path
import tempfile
import os
import unittest
from unittest.mock import patch
from zoneinfo import ZoneInfo

import actielinks
import agendacontrole
import budget
import cursus
import dieptecontrole
import geldwaarden
import intenties
import opslag
import planning_backup
import sjablonen
import taakvolgorde
import tekstcontrole
import werkbronnen
import werkzoeken
import zaak


class VerdiepingTest(unittest.TestCase):
    def test_halve_cent_wordt_decimaal_afgerond(self):
        for bedrag, verwacht in ((1.005, 101), (2.675, 268), ("-1,005", -101), ("€ 1.234,565", 123457), (Decimal("0.005"), 1)):
            with self.subTest(bedrag=bedrag):
                self.assertEqual(zaak.centen(bedrag), verwacht)
        self.assertEqual(zaak.bedrag(-123456), "- € 1.234,56")
        self.assertEqual(geldwaarden.centen(Decimal("0.004" + "9" * 60)), 0)
        with localcontext() as ctx:
            ctx.prec = 2
            ctx.traps[Inexact] = True
            self.assertEqual(geldwaarden.centen(Decimal("1.005")), 101)
            with self.assertRaises(ValueError):
                geldwaarden.centen(Decimal("21474836.471"))

    def test_geen_stille_nul_of_oneindigheid(self):
        for bedrag in (None, "", "geen prijs", True, float("nan"), float("inf"), "1e999", "12.34,56", []):
            with self.subTest(bedrag=bedrag), self.assertRaises(ValueError):
                zaak.centen(bedrag)
        self.assertEqual(zaak.centen("0,00"), 0)
        self.assertIsNone(budget._bedrag("1e999"))

    def test_cursusprijzen_exact_van_voorbereiding_tot_rpc(self):
        with patch.object(opslag, "_rpc_ik", return_value={"id": 7}) as rpc:
            self.assertEqual(cursus.opslaan(None, None, "Test", "", "koop", 1.005, False), 7)
            self.assertEqual(rpc.call_args.kwargs["p_prijs_cent"], 101)
            cursus.plan_opslaan(None, None, "Test", 2.675, "", False)
            self.assertEqual(rpc.call_args.kwargs["p_prijs_cent"], 268)
        with patch.object(opslag, "_rpc_ik") as rpc:
            with self.assertRaises(ValueError):
                cursus.opslaan(None, None, "Test", "", "koop", float("nan"), False)
            rpc.assert_not_called()

    def test_budget_weigert_ongeldig_voordat_rpc_wordt_aangeroepen(self):
        with patch.object(opslag, "_rpc_ik") as rpc:
            with self.assertRaises(budget.Fout):
                budget.toevoegen(float("inf"), "Niet boeken")
            rpc.assert_not_called()
        with patch.object(opslag, "_rpc_ik", return_value={}) as rpc, patch.object(budget, "instellingen", return_value={"gebruikt": True, "regels": {}}):
            regel = budget.toevoegen(1.005, "Test")
            self.assertEqual(regel["bedrag"], -1.01)
            self.assertEqual(rpc.call_args.kwargs["p_regels"][0]["bedrag"], -1.01)

    def test_kostenformulier_bewaart_geen_onleesbare_prijs(self):
        import ast
        import streamlit as st
        from streamlit.testing.v1 import AppTest
        bron = '''
import ast
from pathlib import Path
from datetime import date
import streamlit as st
import zaak
f = next(n for n in ast.parse(Path("zaak_scherm.py").read_text()).body if isinstance(n,ast.FunctionDef) and n.name=="kosten_formulier")
def _account(): pass
def _fout(*args,**kwargs):
    st.session_state.ongewenste_boeking = True
def _klaar(tekst): pass
exec(compile(ast.Module(body=[f],type_ignores=[]),"zaak_scherm.py","exec"),globals())
kosten_formulier()
'''
        app = AppTest.from_string(bron).run()
        app.text_input[0].set_value("geen prijs")
        app.button[0].click().run()
        self.assertFalse(app.exception)
        self.assertTrue(app.error)
        self.assertNotIn("ongewenste_boeking", app.session_state)

    def test_verkeerde_invoervormen_gegeven_gerichte_fouten(self):
        for f, data in ((intenties.valideer, None), (actielinks.valideer, []),
                        (sjablonen.valideer, {"naam": "Test", "soort": []}),
                        (werkbronnen.valideer, {"titel": "Test", "soort": []})):
            with self.subTest(f=f), self.assertRaises(ValueError):
                f(data)
        with self.assertRaises(ValueError):
            taakvolgorde.valideer([{"id": 1}], True, [])
        with self.assertRaises(ValueError):
            taakvolgorde.eis_startbaar(True, [{"id": 1, "klaar": False}])

    def test_onveilige_tekens_geweigerd_en_multiline_notitie_behouden(self):
        for tekst in ("Nul\x00teken", "Surrogaat\ud800", "Titel\nregel"):
            with self.subTest(tekst=repr(tekst)), self.assertRaises(ValueError):
                intenties.valideer({"wat": "taak", "titel": tekst})
        self.assertTrue(tekstcontrole.veilig("Café 👨‍👩‍👦 العربية"))
        notitie = werkbronnen.valideer({"soort": "notitie", "titel": "Test", "tekst": "Regel 1\nRegel 2\twaarde"})
        self.assertIn("\n", notitie["tekst"])

    def test_echte_geldigheidsuren_rond_klokwisseling(self):
        for moment in (datetime(2026,3,29,1,30,tzinfo=ZoneInfo("Europe/Amsterdam")), datetime(2026,10,25,1,30,tzinfo=ZoneInfo("Europe/Amsterdam"))):
            link = actielinks.maak({"titel":"Test","prijs_cent":100,"uren":2}, "a"*32, moment)
            duur = datetime.fromisoformat(link["vervalt"]) - datetime.fromisoformat(link["aangemaakt"])
            self.assertEqual(duur, timedelta(hours=2))

    def test_zoekexport_neemt_geen_onleesbare_datumobjecten_over(self):
        g = {"taken": [{"id":1,"titel":"Vindbaar","deadline":{"token":"NIET-EXPORTEREN"},"notitie":{"token":"NIET-EXPORTEREN"}}]}
        r = werkzoeken.zoek(g, "Vindbaar")
        self.assertIsNone(r["resultaten"][0]["datum"])
        self.assertEqual(r["resultaten"][0]["omschrijving"], "")
        self.assertGreater(r["overgeslagen"], 0)
        self.assertEqual(werkzoeken.zoek({"werkbronnen": ["fout"]}, "x", ["taak"])["overgeslagen"], 0)

    def test_zoeklimiet_en_paginering_na_verkleinen(self):
        import streamlit as st
        from streamlit.testing.v1 import AppTest
        with tempfile.TemporaryDirectory() as d, patch.dict(os.environ, {"ASSISTENT_LOKAAL":"1"}), patch.object(opslag,"DATA_BESTAND",Path(d)/"data.json"):
            g = {**opslag.LEEG,"taken":[{"id":i,"titel":f"Zoek {i}","klaar":False,"deadline":None} for i in range(80)]}
            opslag.opslaan(g)
            app=AppTest.from_string("import werkcontrole_scherm\nwerkcontrole_scherm.zoeken_pagina()").run()
            app.text_input[0].set_value("Zoek").run()
            app.number_input[0].set_value(3).run()
            app.selectbox(key="wc_limiet").set_value(25).run()
            self.assertFalse(app.exception)
            self.assertEqual(app.number_input[0].value,1)
            self.assertTrue(app.warning)

    def test_backup_weigert_niet_canonieke_deadline(self):
        g={"taken":[{"id":1,"titel":"Test","klaar":False,"deadline":"20300107"}],"afspraken":[],"sjablonen":{}}
        with self.assertRaises(ValueError):
            planning_backup.valideer(g)

    def test_ongeldige_weekendinstelling_levert_geen_alternatieven(self):
        item={"wat":"afspraak","titel":"Test","start":"2030-01-07T10:00","einde":"2030-01-07T11:00"}
        r=agendacontrole.controleer(item,[item],{"weekend":"False"})
        self.assertTrue(r["conflicten"])
        self.assertEqual(r["alternatieven"],[])
        self.assertIn("melding",r)

    def test_dieptegevallen_reproduceerbaar_en_niet_namaken_van_resultaat(self):
        for familie in dieptecontrole.FAMILIES:
            with self.subTest(familie=familie):
                self.assertEqual(dieptecontrole.geval(familie, 17),dieptecontrole.geval(familie,17))
        with self.assertRaises(ValueError):
            dieptecontrole.geval("onbekend",0)

    def test_opgeslagen_klokwisseltijden_vereisen_eenduidige_tijd(self):
        for tijd in ("2026-03-29T02:30", "2026-10-25T02:30"):
            with self.subTest(tijd=tijd), self.assertRaises(agendacontrole.ControleOnvolledig):
                agendacontrole.interval({"start":tijd})
        b,e=agendacontrole.interval({"start":"2026-10-25T02:30:00+02:00","einde":"2026-10-25T02:30:00+01:00"})
        self.assertEqual(e-b,timedelta(hours=1))

    def test_bronreview_voert_code_niet_uit_en_geeft_geen_stringwaarden(self):
        import json
        from tools.bron_review import beoordeel, Scripts
        r=beoordeel("privaat='NIET-TONEN'\ntry:\n    exec(privaat)\nexcept Exception:\n    pass\n", "voorbeeld.py")
        self.assertNotIn("NIET-TONEN",json.dumps(r))
        self.assertEqual({s["code"] for s in r["signalen"]},{"brede_exceptie","dynamische_code_beoordelen"})
        parser=Scripts()
        parser.feed('<script type="application/json">{"a":1}</script><script>let x=1;</script><script src="x.js"></script>')
        self.assertEqual(parser.scripts,["let x=1;"])

    def test_diepterapport_bewaart_alleen_veilige_foutmetadata(self):
        import json
        from tools.diepte_controle import controle
        def mislukt(r,i):
            raise ValueError("PRIVE-GEGEVENS-NIET-BEWAREN")
        with patch.dict(dieptecontrole.FAMILIES,{"geld_exact":mislukt}):
            r=controle(per_familie=1)
        self.assertEqual(r["totaal"],15)
        self.assertEqual(r["samenvatting"],{"mislukt":1,"geslaagd":14})
        self.assertNotIn("PRIVE-GEGEVENS-NIET-BEWAREN",json.dumps(r))

    def test_broncontrole_werkt_zonder_ripgrep_op_minimale_runner(self):
        from tools import diepte_controle
        with tempfile.TemporaryDirectory() as mapje:
            root = Path(mapje)
            (root / "module.py").write_text("x = 1\n")
            for naam in (".venv", "node_modules", "attachments", "data"):
                (root / naam).mkdir()
                (root / naam / "overslaan.py").write_text("privé = True\n")
            with patch.object(diepte_controle, "ROOT", root), patch.object(diepte_controle.subprocess, "run", side_effect=FileNotFoundError):
                eerste = diepte_controle.bronhashes()
                self.assertEqual(set(eerste), {"module.py"})
                (root / "module.py").write_text("x = 2\n")
                self.assertNotEqual(eerste, diepte_controle.bronhashes())

    def test_uiterste_kalenderdatum_en_lange_duur_crashen_niet(self):
        item={"wat":"afspraak","titel":"Test","start":"9999-12-31T10:00","einde":"9999-12-31T11:00"}
        r=agendacontrole.controleer(item,[item],nu=datetime(2030,1,1,tzinfo=timezone.utc))
        self.assertTrue(r["conflicten"])
        self.assertLessEqual(len(r["alternatieven"]),3)
        item={"wat":"afspraak","titel":"Test","start":"2030-01-07T10:00","einde":"9999-12-31T11:00"}
        r=agendacontrole.controleer(item,[item])
        self.assertEqual(r["alternatieven"],[])


if __name__=="__main__":
    unittest.main()
