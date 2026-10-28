"""Werkstromen verbinden zonder impliciete opslag of onveilige bronverwijzingen."""
import copy
import itertools
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import herstel
import integratiecontrole
import opslag
import planning_backup
import werkcontext


class IntegratieTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        for p in (patch.dict(os.environ,{"ASSISTENT_LOKAAL":"1"}),patch.object(opslag,"DATA_BESTAND",Path(self.tmp.name)/"data.json")):
            p.start();self.addCleanup(p.stop)
        self.g={**copy.deepcopy(opslag.LEEG),"volgend_id":4,
            "taken":[{"id":1,"titel":"Onderzoek","klaar":True,"deadline":None,"minuten":30},
                     {"id":2,"titel":"Rapport","klaar":False,"deadline":"2030-01-07","minuten":60,"afhankelijk_van":[1]}],
            "afspraken":[{"id":3,"titel":"Rapport bespreken","start":"2030-01-07T10:00","einde":"2030-01-07T11:00","taak_id":2}],
            "werkbronnen":{
                "note":{"soort":"notitie","titel":"Analyse","tekst":"Bevinding","doel_soort":"taak","doel_id":2,"aangemaakt":"2030-01-07T08:00:00+00:00"},
                "url":{"soort":"url","titel":"Onderbouwing","url":"https://example.org/rapport","doel_soort":"afspraak","doel_id":3,"aangemaakt":"2030-01-07T08:00:00+00:00"},
                "cloud":{"soort":"document","titel":"Cloud","bron_id":99,"doel_soort":"taak","doel_id":2,"aangemaakt":"2030-01-07T08:00:00+00:00"}},
            "instellingen":{"api_sleutel":"GEHEIM-NIET-EXPORTEREN"}}
        opslag.opslaan(self.g)

    def test_dossier_bevat_samenhang_en_geen_config(self):
        voor=copy.deepcopy(self.g)
        r=werkcontext.samenhang(self.g,"afspraak",3)
        self.assertEqual(r["taak"]["id"],2)
        self.assertEqual(r["voorgangers"][0]["id"],1)
        self.assertEqual(len(r["bronnen"]),3)
        self.assertNotIn("GEHEIM-NIET-EXPORTEREN",json.dumps(r))
        self.assertEqual(self.g,voor)
        with self.assertRaises(ValueError): werkcontext.verwijzing("taak",True)
        with self.assertRaises(ValueError): werkcontext.samenhang({"taken":[],"afspraken":[]},"taak",2)

    def test_bron_zonder_doel_en_sjabloon_houden_eigen_type(self):
        g=copy.deepcopy(self.g);g["taken"]=[]
        r=werkcontext.samenhang(g,"bron","note")
        self.assertEqual(r["hoofd"]["soort"],"bron")
        self.assertTrue(r["meldingen"])
        g["sjablonen"]={"s":{"naam":"Werkdag","soort":"dagplan"}}
        r=werkcontext.samenhang(g,"sjabloon","s")
        self.assertEqual(r["hoofd"]["soort"],"sjabloon")
        self.assertEqual(r["hoofd"]["sjabloonsoort"],"dagplan")

    def test_oude_backup_blijft_bruikbaar_nieuwe_backup_bevat_draagbare_bronnen(self):
        self.assertEqual(planning_backup.lees(planning_backup.exporteer(self.g))["versie"],1)
        data=planning_backup.exporteer(self.g,bronnen=True)
        r=planning_backup.lees(data)
        self.assertEqual(r["versie"],2)
        self.assertEqual(len(r["gegevens"]["werkbronnen"]),2)
        self.assertNotIn(b"bron_id",data)
        self.assertNotIn(b"GEHEIM-NIET-EXPORTEREN",data)

    def test_bronverwijzingen_worden_bij_herstel_atomair_geremapt(self):
        data=planning_backup.exporteer(self.g,bronnen=True)
        ontvangst=opslag.planning_herstellen("herstel",data,planning_backup.vingerafdruk(opslag.laden()))
        self.assertEqual(ontvangst["toegevoegd"]["werkbronnen"],2)
        g=opslag.laden();nieuw=g["taken"][-1]
        r=werkcontext.samenhang(g,"taak",nieuw["id"])
        self.assertEqual(len(r["bronnen"]),2)
        self.assertTrue(any(h["soort"]=="herstel" for h in r["historie"]))
        import actieoverzicht
        self.assertTrue(any(a["soort"]=="herstel" and not a["terugdraaibaar"] for a in actieoverzicht.overzicht(g)))
        self.assertNotIn(99,[b.get("bron_id") for b in r["bronnen"]])
        self.assertEqual(r["voorgangers"][0]["id"],g["taken"][-2]["id"])
        self.assertEqual(r["afspraken"][0]["id"],g["afspraken"][-1]["id"])

    def test_herstel_selectie_behoudt_geen_verweesde_bronnen(self):
        data=planning_backup.exporteer(self.g,bronnen=True)
        r=planning_backup.lees(planning_backup.selecteer(data,["afspraken"]))["gegevens"]
        self.assertEqual(len(r["werkbronnen"]),1)
        self.assertEqual(next(iter(r["werkbronnen"].values()))["doel_id"],3)
        self.assertNotIn("taak_id",r["afspraken"][0])
        r=planning_backup.lees(planning_backup.selecteer(data,["taken"],bronnen=False))["gegevens"]
        self.assertEqual(r["werkbronnen"],{})

    def test_vervalste_cloudbron_en_extra_velden_worden_geweigerd(self):
        origineel=json.loads(planning_backup.exporteer(self.g,bronnen=True))
        for wijzig in (lambda b:b.update(soort="document",bron_id=99),lambda b:b.update(token="SMOKKEL"),lambda b:b.update(doel_id=999)):
            r=copy.deepcopy(origineel);wijzig(next(iter(r["gegevens"]["werkbronnen"].values())))
            r["sha256"]=planning_backup.vingerafdruk({k:v for k,v in r.items() if k!="sha256"})
            with self.assertRaises(ValueError): planning_backup.lees(json.dumps(r).encode())

    def test_verloren_antwoord_en_schrijffout_laten_geen_halve_bundel(self):
        data=planning_backup.exporteer(self.g,bronnen=True);basis=planning_backup.vingerafdruk(opslag.laden())
        echt=opslag.opslaan
        def verlies(g): echt(g);raise opslag.httpx.ReadTimeout("Antwoord verloren")
        with patch.object(opslag,"opslaan",side_effect=verlies),self.assertRaises(opslag.httpx.ReadTimeout):
            opslag.planning_herstellen("zelfde",data,basis)
        r=opslag.planning_herstellen("zelfde",data,basis)
        self.assertEqual(len(opslag.laden()["werkbronnen"]),5)
        self.assertEqual(r["toegevoegd"]["taken"],2)
        voor=opslag.laden()
        with patch.object(opslag,"opslaan",side_effect=OSError("vol")),self.assertRaises(OSError):
            opslag.planning_herstellen("ander",data,planning_backup.vingerafdruk(voor))
        self.assertEqual(opslag.laden(),voor)

    def test_herstelset_is_puur_en_beschermt_sleutelbotsing(self):
        r=planning_backup.lees(planning_backup.exporteer(self.g,bronnen=True));voor=copy.deepcopy(self.g)
        ids=itertools.count()
        resultaat=herstel.maak(self.g,r,maak_id=lambda:f"nieuw-{next(ids)}")
        self.assertEqual(self.g,voor)
        self.assertEqual(len(resultaat["toevoegingen"]["werkbronnen"]),2)
        with self.assertRaises(ValueError): herstel.maak(self.g,r,maak_id=lambda:"note")

    def test_zoeken_dossier_bron_sjabloon_en_bevestigen_vormen_een_stroom(self):
        from streamlit.testing.v1 import AppTest
        bron='''
import streamlit as st
import werkcontrole_scherm,werkcontext_scherm,werkbronnen_scherm,sjablonen_scherm
if doel:=st.session_state.pop("ga_naar",None): st.session_state.scherm=doel
scherm=st.session_state.get("scherm","werkzoeken")
if scherm=="werkzoeken": werkcontrole_scherm.zoeken_pagina()
elif scherm=="werkdossier": werkcontext_scherm.pagina()
elif scherm=="werkbronnen": werkbronnen_scherm.pagina()
elif scherm=="sjablonen": sjablonen_scherm.pagina()
'''
        app=AppTest.from_string(bron).run()
        app.text_input[0].set_value("Rapport").run()
        next(b for b in app.button if b.label=="Open werkdossier").click().run()
        self.assertFalse(app.exception)
        self.assertEqual(app.session_state["wk_ref"],{"soort":"taak","id":2})
        next(b for b in app.button if b.label=="Voeg een bron toe bij dit werk").click().run()
        self.assertEqual(app.selectbox(key="wb_doel").value,("taak",2))
        next(x for x in app.text_input if x.label=="Titel van de koppeling").set_value("Nieuwe bron")
        app.text_area[0].set_value("Nog een bevinding")
        next(b for b in app.button if b.label=="Bron koppelen").click().run()
        self.assertFalse(app.exception)
        app.button(key="wb_context_note").click().run()
        next(b for b in app.button if b.label=="Voorbereiden als sjabloon").click().run()
        self.assertFalse(app.exception)
        self.assertEqual(app.text_input[0].value,"Rapport")
        self.assertEqual(len(opslag.laden()["taken"]),2)
        next(b for b in app.button if b.label=="Sjabloon opslaan").click().run()
        next(b for b in app.button if b.label=="Voorstel voorbereiden").click().run()
        self.assertEqual(len(opslag.laden()["taken"]),2)
        next(b for b in app.button if b.label=="Bevestigen").click().run()
        self.assertFalse(app.exception)
        self.assertEqual(len(opslag.laden()["taken"]),3)

    def test_accountwisseling_wist_dossier_en_pending_opslag_blijft_behouden(self):
        from streamlit.testing.v1 import AppTest
        app=AppTest.from_string('''
import streamlit as st
import werkcontext_scherm,werkbronnen_scherm,sjablonen_scherm
werkcontext_scherm._account()
if st.button("Open"):
    werkcontext_scherm.openen("taak",2)
werkcontext_scherm.pagina()
''').run()
        app.button[0].click().run()
        self.assertIn("wk_ref",app.session_state)
        app.session_state["naam"]="ander"
        app.run()
        self.assertNotIn("wk_ref",app.session_state)
        self.assertFalse(app.exception)

    def test_nieuwe_integratiegevallen_zijn_reproduceerbaar(self):
        for familie in list(integratiecontrole.FAMILIES)[-5:]:
            with self.subTest(familie=familie):
                self.assertEqual(integratiecontrole.geval(familie,37),integratiecontrole.geval(familie,37))

    def test_werkstroom_overschrijft_geen_onzekere_bron_of_sjabloonopslag(self):
        from streamlit.testing.v1 import AppTest
        app=AppTest.from_string("""
import streamlit as st
import werkbronnen_scherm,sjablonen_scherm
werkbronnen_scherm._account()
sjablonen_scherm._account()
if st.button("Brondoel"):
    try: werkbronnen_scherm.voor_doel("taak",2)
    except ValueError as fout: st.warning(str(fout))
if st.button("Sjabloon"):
    try: sjablonen_scherm.uit_werk("taak",{"id":2,"titel":"Rapport"})
    except ValueError as fout: st.warning(str(fout))
""").run()
        app.session_state["wb_pending"]={"id":"onzekere-bron"}
        app.session_state["sj_pending"]={"id":"onzeker-sjabloon"}
        app.button[0].click().run()
        self.assertTrue(app.warning)
        self.assertEqual(app.session_state["wb_pending"]["id"],"onzekere-bron")
        app.button[1].click().run()
        self.assertEqual(app.session_state["sj_pending"]["id"],"onzeker-sjabloon")

    def test_verwijderd_doel_wordt_niet_stil_omgekoppeld(self):
        from streamlit.testing.v1 import AppTest
        app=AppTest.from_string("import werkbronnen_scherm\nwerkbronnen_scherm.pagina()").run()
        app.selectbox(key="wb_doel").set_value(("taak",2)).run()
        opslag.taak_verwijderen(2)
        app.run()
        self.assertFalse(app.exception)
        self.assertIsNone(app.selectbox(key="wb_doel").value)
        self.assertTrue(app.warning)
        self.assertTrue(next(b for b in app.button if b.label=="Bron koppelen").disabled)

    def test_oudere_afspraak_zonder_eindtijd_kan_als_sjabloon_worden_voorbereid(self):
        import sjablonen
        item={"id":3,"titel":"Overleg","start":"2030-01-07T10:00","einde":None}
        s=sjablonen.uit_resultaat("afspraak",item)
        self.assertEqual(s["minuten"],60)
        self.assertNotIn("start",s)
        with self.assertRaises(ValueError):
            sjablonen.uit_resultaat("afspraak",{"id":3,"titel":"Hele dag","start":"2030-01-07"})

    def test_herstel_overschrijdt_geen_overdraagbare_idgrens(self):
        huidig=copy.deepcopy(self.g)
        huidig["volgend_id"]=2**53
        backup=planning_backup.lees(planning_backup.exporteer(self.g,bronnen=True))
        with self.assertRaises(ValueError):
            herstel.maak(huidig,backup)
        self.assertEqual(huidig["volgend_id"],2**53)


if __name__=="__main__": unittest.main()
