"""Integratietests met echte PostgreSQL-transacties in een tijdelijk testdatabase.

Start een geïsoleerde postgres:17-container zonder netwerk/poorten en stel
ASSISTENT_TEST_POSTGRES_CONTAINER in op de containernaam. Authenticatie wordt
hier nagebootst; de bestaande Supabase-login zelf valt buiten deze tests.
"""

import json
import os
import subprocess
import threading
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch

import intenties
import opslag
import agendacontrole
import dagplan
import actielinks
from datetime import datetime


@unittest.skipUnless(os.environ.get("ASSISTENT_TEST_POSTGRES_CONTAINER"), "Geen PostgreSQL-testcontainer opgegeven")
class VeiligeOpslagTest(unittest.TestCase):
    @classmethod
    def sql(cls, tekst, database=None):
        opdracht = ["docker", "--host=unix:///var/run/docker.sock", "exec", "-i",
                    os.environ["ASSISTENT_TEST_POSTGRES_CONTAINER"], "psql", "-U", "postgres",
                    "-d", database or cls.database, "-XqAt", "-v", "ON_ERROR_STOP=1"]
        omgeving = {k: v for k, v in os.environ.items() if k not in
                    {"DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"}}
        return subprocess.run(opdracht, input=tekst, text=True, capture_output=True, check=True,
                              env=omgeving, timeout=20).stdout.strip()

    @classmethod
    def setUpClass(cls):
        cls.database = "assistent_test_" + uuid.uuid4().hex
        cls.sql(f'create database "{cls.database}";', database="postgres")
        cls.addClassCleanup(lambda: cls.sql(f'drop database "{cls.database}" with (force);', database="postgres"))
        cls.sql("""
            do $$ begin
              if not exists(select from pg_roles where rolname='anon') then create role anon; end if;
              if not exists(select from pg_roles where rolname='authenticated') then create role authenticated; end if;
            end $$;
            create schema private;
            create table public.gegevens(id bigint primary key, data jsonb);
            create function private.gebruiker_id(p_naam text, p_wachtwoord text) returns bigint
            language sql as $$ select case when p_wachtwoord = 'test-only' then
              case p_naam when 'alice' then 1::bigint when 'bob' then 2::bigint end end $$;
            create function public.mijn_gegevens(p_naam text, p_wachtwoord text) returns jsonb
            language plpgsql security definer set search_path to '' as $$
            declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
            begin
              if v_id is null then return jsonb_build_object('geen_toegang',true); end if;
              return jsonb_build_object('data',(select data from public.gegevens where id=v_id),
                                         'gebruiker',jsonb_build_object('id',v_id));
            end $$;
            create function public.mijn_gegevens_bewaren(p_naam text, p_wachtwoord text, p_data jsonb)
              returns boolean language sql as $$ select true $$;
        """)
        migratie = Path(__file__).with_name("sql").joinpath("veilige_opslag.sql").read_text()
        cls.sql(migratie)
        cls.sql(migratie)  # migratie kan opnieuw worden uitgevoerd

    @classmethod
    def rpc(cls, functie, **parameters):
        if functie not in {"mijn_gegevens", "mijn_gegevens_veilig_bewaren"}:
            raise ValueError(functie)
        argumenten = []
        for naam, waarde in parameters.items():
            if naam not in {"p_naam", "p_wachtwoord", "p_basis", "p_data"}:
                raise ValueError(naam)
            inhoud = json.dumps(waarde) if naam in {"p_basis", "p_data"} else waarde
            literal = "'" + inhoud.replace("'", "''") + "'"
            argumenten.append(naam + " => " + literal + ("::jsonb" if naam in {"p_basis", "p_data"} else ""))
        return json.loads(cls.sql("set role anon; select public." + functie + "(" + ",".join(argumenten) + ");"))

    def setUp(self):
        self.sql("truncate public.gegevens;")
        opslag.vergeet_gegevens()
        self.patch_env = patch.dict(os.environ, ASSISTENT_LOKAAL="0")
        self.patch_env.start()
        self.addCleanup(self.patch_env.stop)
        self.patch_rpc = patch.object(opslag, "_rpc", side_effect=self.rpc)
        self.patch_rpc.start()
        self.addCleanup(self.patch_rpc.stop)
        opslag.gebruik_account("alice", "test-only")
        self.addCleanup(lambda: opslag.gebruik_account("", ""))

    def test_twee_servers_dezelfde_opdracht(self):
        r = intenties.voorstel("Taak belasting vrijdag")["gegevens"]
        barriere = threading.Barrier(2)
        lokaal = threading.local()
        conflicten = []

        def gelijktijdig(functie, **parameters):
            antwoord = self.rpc(functie, **parameters)
            if functie == "mijn_gegevens" and not getattr(lokaal, "gelezen", False):
                lokaal.gelezen = True
                barriere.wait(timeout=10)  # beide servers schrijven vanuit dezelfde basis
            if antwoord.get("conflict"):
                conflicten.append(antwoord)
            return antwoord

        def bevestig(_):
            opslag.gebruik_account("alice", "test-only")
            return opslag.intentie_bevestigen("zelfde-opdracht", r)

        with ThreadPoolExecutor(max_workers=2) as pool:
            # Sla het Python-slot over: aparte appservers delen dat slot niet.
            with patch.object(opslag, "_slot", threading.Semaphore(2)), patch.object(opslag, "_rpc", side_effect=gelijktijdig):
                antwoorden = list(pool.map(bevestig, range(2)))
        self.assertEqual(antwoorden[0], antwoorden[1])
        self.assertTrue(conflicten)
        self.assertEqual(len(opslag.laden(vers=True)["taken"]), 1)

    def test_bestaande_takenflow_gebruikt_veilige_opslag(self):
        taak = opslag.taak_toevoegen("Bestaande taak")
        opslag.taak_bijwerken(taak["id"], titel="Bewerkt")
        opslag.taak_afronden(taak["id"])
        bewaard = opslag.laden(vers=True)["taken"][0]
        self.assertEqual(bewaard["titel"], "Bewerkt")
        self.assertTrue(bewaard["klaar"])

    def test_verouderde_kopie_kan_niets_overschrijven(self):
        basis = opslag.laden(vers=True)
        r = intenties.voorstel("Taak belasting vrijdag")["gegevens"]
        opslag.intentie_bevestigen("nieuw", r)
        antwoord = self.rpc("mijn_gegevens_veilig_bewaren", p_naam="alice", p_wachtwoord="test-only",
                            p_basis=basis, p_data={**basis, "taken": []})
        self.assertEqual(antwoord, {"conflict": True})
        self.assertEqual(len(opslag.laden(vers=True)["taken"]), 1)

    def test_nieuw_lezen_maakt_oude_schrijfkopie_niet_geldig(self):
        oud = opslag.laden(vers=True)
        opslag.intentie_bevestigen("nieuw", intenties.voorstel("Taak belasting vrijdag")["gegevens"])
        opslag.laden(vers=True)
        oud["instellingen"] = {"thema": "donker"}
        with self.assertRaises(opslag.OpslagConflict):
            opslag.opslaan(oud)
        self.assertEqual(len(opslag.laden(vers=True)["taken"]), 1)

    def test_losstaande_opdrachten_en_accounts(self):
        r = intenties.voorstel("Taak belasting vrijdag")["gegevens"]
        def bevestig(nummer):
            opslag.gebruik_account("alice", "test-only")
            return opslag.intentie_bevestigen(str(nummer), r)
        with ThreadPoolExecutor(max_workers=2) as pool, patch.object(opslag, "_slot", threading.Semaphore(2)):
            list(pool.map(bevestig, range(2)))
        self.assertEqual(len(opslag.laden(vers=True)["taken"]), 2)
        opslag.gebruik_account("bob", "test-only")
        self.assertFalse(opslag.laden(vers=True)["taken"])
        opslag.intentie_bevestigen("0", r)
        self.assertEqual(len(opslag.laden(vers=True)["taken"]), 1)

    def test_verloren_antwoord_na_commit(self):
        r = intenties.voorstel("Taak belasting vrijdag")["gegevens"]
        def verlies(functie, **parameters):
            resultaat = self.rpc(functie, **parameters)
            if functie == "mijn_gegevens_veilig_bewaren":
                raise opslag.httpx.ReadTimeout("Antwoord verloren na commit")
            return resultaat
        with patch.object(opslag, "_rpc", side_effect=verlies), self.assertRaises(opslag.httpx.ReadTimeout):
            opslag.intentie_bevestigen("verloren", r)
        opslag.intentie_bevestigen("verloren", r)
        self.assertEqual(len(opslag.laden(vers=True)["taken"]), 1)

    def test_oude_rpc_en_verkeerd_account_geweigerd(self):
        with self.assertRaises(subprocess.CalledProcessError):
            self.sql("set role anon; select public.mijn_gegevens_bewaren('alice','test-only','{}');")
        opslag.gebruik_account("alice", "verkeerd")
        with self.assertRaises(opslag.GeenToegang):
            opslag.laden(vers=True)
        self.assertEqual(self.sql("select count(*) from public.gegevens;"), "0")

    def test_ongedaan_na_verloren_antwoord(self):
        r = intenties.voorstel("Taak belasting vrijdag")["gegevens"]
        opslag.intentie_bevestigen("undo", r)
        def verlies(functie, **parameters):
            resultaat = self.rpc(functie, **parameters)
            if functie == "mijn_gegevens_veilig_bewaren":
                raise opslag.httpx.ReadTimeout("Antwoord verloren na commit")
            return resultaat
        with patch.object(opslag, "_rpc", side_effect=verlies), self.assertRaises(opslag.httpx.ReadTimeout):
            opslag.intentie_ongedaan("undo")
        self.assertEqual(opslag.intentie_ongedaan("undo")["status"], "ongedaan")
        self.assertTrue(opslag.intentie_bevestigen("undo", r)["ongedaan"])
        self.assertFalse(opslag.laden(vers=True)["taken"])

    def test_ongedaan_conflict_behoudt_latere_wijziging(self):
        opslag.intentie_bevestigen("undo", intenties.voorstel("Taak belasting vrijdag")["gegevens"])
        gewijzigd = False
        def wijzig(functie, **parameters):
            nonlocal gewijzigd
            if functie == "mijn_gegevens_veilig_bewaren" and not gewijzigd:
                gewijzigd = True
                self.sql('''update public.gegevens set data = jsonb_set(data, '{taken,0,titel}', '"Later gewijzigd"') where id=1;''')
            return self.rpc(functie, **parameters)
        with patch.object(opslag, "_rpc", side_effect=wijzig):
            self.assertEqual(opslag.intentie_ongedaan("undo")["status"], "gewijzigd")
        self.assertEqual(opslag.laden(vers=True)["taken"][0]["titel"], "Later gewijzigd")

    def test_twee_servers_mogen_geen_overlappende_afspraken_opslaan(self):
        voorstel = {"wat": "afspraak", "titel": "Overleg", "start": "2030-01-07T10:00", "einde": "2030-01-07T11:00"}
        barriere = threading.Barrier(2)
        lokaal = threading.local()

        def tegelijk(functie, **parameters):
            antwoord = self.rpc(functie, **parameters)
            if functie == "mijn_gegevens" and not getattr(lokaal, "gelezen", False):
                lokaal.gelezen = True
                barriere.wait(timeout=10)
            return antwoord

        def bevestig(nummer):
            opslag.gebruik_account("alice", "test-only")
            try:
                opslag.intentie_bevestigen(str(nummer), voorstel)
                return "opgeslagen"
            except agendacontrole.Overlap:
                return "overlap"

        with ThreadPoolExecutor(max_workers=2) as pool, patch.object(opslag, "_slot", threading.Semaphore(2)), \
                patch.object(opslag, "_rpc", side_effect=tegelijk):
            antwoorden = list(pool.map(bevestig, range(2)))
        self.assertCountEqual(antwoorden, ["opgeslagen", "overlap"])
        self.assertEqual(len(opslag.laden(vers=True)["afspraken"]), 1)

    def test_twee_servers_dagplan_bewaren_geen_dubbele_taken(self):
        opslag.taak_toevoegen("Belasting", minuten=60)
        opslag.taak_toevoegen("Leren", minuten=30)
        with patch.object(dagplan, "nu", return_value=datetime(2030, 1, 7, 9)):
            plan = opslag.dagvoorstel()
            barriere = threading.Barrier(2)
            lokaal = threading.local()
            def tegelijk(functie, **parameters):
                antwoord = self.rpc(functie, **parameters)
                if functie == "mijn_gegevens" and not getattr(lokaal, "gelezen", False):
                    lokaal.gelezen = True
                    barriere.wait(timeout=10)
                return antwoord
            def bevestig(nummer):
                opslag.gebruik_account("alice", "test-only")
                try:
                    opslag.dagplan_bevestigen("dag-" + str(nummer), plan)
                    return "opgeslagen"
                except dagplan.PlanOngeldig:
                    return "verouderd"
            with ThreadPoolExecutor(max_workers=2) as pool, patch.object(opslag, "_slot", threading.Semaphore(2)), \
                    patch.object(opslag, "_rpc", side_effect=tegelijk):
                antwoorden = list(pool.map(bevestig, range(2)))
            self.assertCountEqual(antwoorden, ["opgeslagen", "verouderd"])
            self.assertEqual(len(opslag.laden(vers=True)["afspraken"]), 2)

    def test_dagplan_verloren_antwoord_na_commit(self):
        opslag.taak_toevoegen("Belasting", minuten=60)
        with patch.object(dagplan, "nu", return_value=datetime(2030, 1, 7, 9)):
            plan = opslag.dagvoorstel()
            def verlies(functie, **parameters):
                antwoord = self.rpc(functie, **parameters)
                if functie == "mijn_gegevens_veilig_bewaren":
                    raise opslag.httpx.ReadTimeout("Antwoord verloren na commit")
                return antwoord
            with patch.object(opslag, "_rpc", side_effect=verlies), self.assertRaises(opslag.httpx.ReadTimeout):
                opslag.dagplan_bevestigen("dag", plan)
            opslag.dagplan_bevestigen("dag", plan)
            self.assertEqual(len(opslag.laden(vers=True)["afspraken"]), 1)

    def test_twee_servers_herplanning_vervangen_niet_tweemaal(self):
        taak = opslag.taak_toevoegen("Belasting", minuten=60)
        opslag.afspraak_toevoegen("Overleg", "2030-01-07T09:30", "2030-01-07T10:30")
        opslag.afspraak_toevoegen("Oud blok", "2030-01-07T11:00", "2030-01-07T12:00", taak_id=taak["id"], soort="focus")
        with patch.object(dagplan, "nu", return_value=datetime(2030, 1, 7, 10)):
            plan = opslag.herplanvoorstel(uitloop=30)
            barriere = threading.Barrier(2)
            lokaal = threading.local()
            def tegelijk(functie, **parameters):
                antwoord = self.rpc(functie, **parameters)
                if functie == "mijn_gegevens" and not getattr(lokaal, "gelezen", False):
                    lokaal.gelezen = True
                    barriere.wait(timeout=10)
                return antwoord
            def bevestig(nummer):
                opslag.gebruik_account("alice", "test-only")
                try:
                    opslag.dagplan_bevestigen("herplan-" + str(nummer), plan)
                    return "opgeslagen"
                except dagplan.PlanOngeldig:
                    return "verouderd"
            with ThreadPoolExecutor(max_workers=2) as pool, patch.object(opslag, "_slot", threading.Semaphore(2)), \
                    patch.object(opslag, "_rpc", side_effect=tegelijk):
                antwoorden = list(pool.map(bevestig, range(2)))
            self.assertCountEqual(antwoorden, ["opgeslagen", "verouderd"])
            self.assertEqual(len(opslag.laden(vers=True)["afspraken"]), 2)

    def test_herplanning_opnieuw_ophalen_na_verloren_commitantwoord(self):
        taak = opslag.taak_toevoegen("Belasting", minuten=60)
        opslag.afspraak_toevoegen("Oud blok", "2030-01-07T11:00", "2030-01-07T12:00", taak_id=taak["id"], soort="focus")
        with patch.object(dagplan, "nu", return_value=datetime(2030, 1, 7, 10)):
            plan = opslag.herplanvoorstel()
            def verlies(functie, **parameters):
                antwoord = self.rpc(functie, **parameters)
                if functie == "mijn_gegevens_veilig_bewaren":
                    raise opslag.httpx.ReadTimeout("Antwoord verloren na commit")
                return antwoord
            with patch.object(opslag, "_rpc", side_effect=verlies), self.assertRaises(opslag.httpx.ReadTimeout):
                opslag.dagplan_bevestigen("herplan", plan)
            opslag.dagplan_bevestigen("herplan", plan)
            self.assertEqual(len(opslag.laden(vers=True)["afspraken"]), 1)
            self.assertEqual(opslag.intentie_ongedaan("herplan")["status"], "ongedaan")

    def test_actielinks_blijven_binnen_het_eigen_account(self):
        voorstel = {"titel": "Training", "prijs_cent": 4500, "uren": 24}
        alice = opslag.actielink_opslaan("zelfde", voorstel)
        opslag.gebruik_account("bob", "test-only")
        with self.assertRaises(actielinks.Fout):
            opslag.actielink_openen(alice["code"])
        bob = opslag.actielink_opslaan("zelfde", voorstel)
        self.assertNotEqual(alice["code"], bob["code"])
        opslag.gebruik_account("alice", "test-only")
        opslag.actielink_intrekken(alice["code"])
        opslag.gebruik_account("bob", "test-only")
        self.assertEqual(opslag.actielink_openen(bob["code"])["titel"], "Training")

    def test_twee_servers_maken_een_actielink_per_opdracht(self):
        barriere = threading.Barrier(2)
        lokaal = threading.local()
        def tegelijk(functie, **parameters):
            antwoord = self.rpc(functie, **parameters)
            if functie == "mijn_gegevens" and not getattr(lokaal, "gelezen", False):
                lokaal.gelezen = True
                barriere.wait(timeout=10)
            return antwoord
        def maak(_):
            opslag.gebruik_account("alice", "test-only")
            return opslag.actielink_opslaan("zelfde", {"titel": "Training", "prijs_cent": 4500, "uren": 24})
        with ThreadPoolExecutor(max_workers=2) as pool, patch.object(opslag, "_slot", threading.Semaphore(2)), \
                patch.object(opslag, "_rpc", side_effect=tegelijk):
            links = list(pool.map(maak, range(2)))
        self.assertEqual(links[0], links[1])
        self.assertEqual(len(opslag.laden(vers=True)["actielinks"]), 1)

    def test_sjablonen_en_activiteiten_zijn_accountgebonden(self):
        import actieoverzicht
        sjabloon = {"naam": "Ochtend", "soort": "taak", "titel": "Bellen", "minuten": 15}
        opslag.sjabloon_opslaan("zelfde", sjabloon)
        antwoord = opslag.intentie_bevestigen("taak", {"wat": "taak", "titel": "Bellen", "deadline": None})
        self.assertEqual(actieoverzicht.overzicht(opslag.laden(vers=True))[0]["herkomst"], antwoord["herkomst"])
        opslag.gebruik_account("bob", "test-only")
        self.assertEqual(actieoverzicht.overzicht(opslag.laden(vers=True)), [])
        self.assertFalse(opslag.laden(vers=True).get("sjablonen"))
        opslag.sjabloon_verwijderen("zelfde", sjabloon)
        opslag.gebruik_account("alice", "test-only")
        self.assertEqual(opslag.laden(vers=True)["sjablonen"], {"zelfde": sjabloon})

    def test_twee_servers_bewaren_verschillende_sjablonen(self):
        barriere = threading.Barrier(2)
        lokaal = threading.local()
        def tegelijk(functie, **parameters):
            antwoord = self.rpc(functie, **parameters)
            if functie == "mijn_gegevens" and not getattr(lokaal, "gelezen", False):
                lokaal.gelezen = True
                barriere.wait(timeout=10)
            return antwoord
        def maak(nummer):
            opslag.gebruik_account("alice", "test-only")
            return opslag.sjabloon_opslaan(str(nummer), {"naam": "Werkdag", "soort": "dagplan"})
        with ThreadPoolExecutor(max_workers=2) as pool, patch.object(opslag, "_slot", threading.Semaphore(2)), \
                patch.object(opslag, "_rpc", side_effect=tegelijk):
            list(pool.map(maak, range(2)))
        self.assertEqual(set(opslag.laden(vers=True)["sjablonen"]), {"0", "1"})

    def test_gelijktijdige_afhankelijkheden_maken_geen_cyclus(self):
        a = opslag.taak_toevoegen("Onderzoek")
        b = opslag.taak_toevoegen("Rapport")
        barriere = threading.Barrier(2)
        lokaal = threading.local()
        def tegelijk(functie, **parameters):
            antwoord = self.rpc(functie, **parameters)
            if functie == "mijn_gegevens" and not getattr(lokaal, "gelezen", False):
                lokaal.gelezen = True
                barriere.wait(timeout=10)
            return antwoord
        def wijzig(ids):
            opslag.gebruik_account("alice", "test-only")
            try:
                opslag.taak_afhankelijkheden(ids[0], [ids[1]], [])
                return True
            except ValueError:
                return False
        with ThreadPoolExecutor(max_workers=2) as pool, patch.object(opslag, "_slot", threading.Semaphore(2)), \
                patch.object(opslag, "_rpc", side_effect=tegelijk):
            resultaten = list(pool.map(wijzig, [(a["id"], b["id"]), (b["id"], a["id"])]))
        self.assertEqual(sorted(resultaten), [False, True])
        taken = opslag.laden(vers=True)["taken"]
        self.assertEqual(sum(bool(t.get("afhankelijk_van")) for t in taken), 1)
        opslag.gebruik_account("bob", "test-only")
        with self.assertRaises(ValueError):
            opslag.taak_afhankelijkheden(a["id"], [b["id"]], [])
        self.assertEqual(opslag.laden(vers=True)["taken"], [])

    def test_gelijktijdig_herstel_is_enkelvoudig_en_bewaart_idverwijzingen(self):
        import planning_backup
        a = opslag.taak_toevoegen("Eerst")
        b = opslag.taak_toevoegen("Daarna")
        opslag.taak_afhankelijkheden(b["id"], [a["id"]], [])
        g = opslag.laden(vers=True)
        data, basis = planning_backup.exporteer(g), planning_backup.vingerafdruk(g)
        barriere = threading.Barrier(2)
        lokaal = threading.local()
        def tegelijk(functie, **parameters):
            antwoord = self.rpc(functie, **parameters)
            if functie == "mijn_gegevens" and not getattr(lokaal, "gelezen", False):
                lokaal.gelezen = True
                barriere.wait(timeout=10)
            return antwoord
        def herstel(_):
            opslag.gebruik_account("alice", "test-only")
            return opslag.planning_herstellen("herstel", data, basis)
        with ThreadPoolExecutor(max_workers=2) as pool, patch.object(opslag, "_slot", threading.Semaphore(2)), \
                patch.object(opslag, "_rpc", side_effect=tegelijk):
            resultaten = list(pool.map(herstel, range(2)))
        self.assertEqual(resultaten[0], resultaten[1])
        taken = opslag.laden(vers=True)["taken"]
        self.assertEqual(len(taken), 4)
        self.assertEqual(taken[3]["afhankelijk_van"], [taken[2]["id"]])
        opslag.gebruik_account("bob", "test-only")
        self.assertEqual(opslag.laden(vers=True)["taken"], [])
        self.assertFalse(opslag.laden(vers=True).get("planning_herstel"))

    def test_gelijktijdige_bronkoppelingen_en_accountgrens(self):
        taak = opslag.taak_toevoegen("Onderzoek")
        barriere = threading.Barrier(2)
        lokaal = threading.local()
        def tegelijk(functie, **parameters):
            antwoord = self.rpc(functie, **parameters)
            if functie == "mijn_gegevens" and not getattr(lokaal, "gelezen", False):
                lokaal.gelezen = True
                barriere.wait(timeout=10)
            return antwoord
        def bewaar(n):
            opslag.gebruik_account("alice", "test-only")
            return opslag.werkbron_opslaan(str(n), "taak", taak["id"], {"soort": "notitie", "titel": "Resultaat", "tekst": "Alleen Alice"})
        with ThreadPoolExecutor(max_workers=2) as pool, patch.object(opslag, "_slot", threading.Semaphore(2)), \
                patch.object(opslag, "_rpc", side_effect=tegelijk):
            resultaten = list(pool.map(bewaar, range(2)))
        self.assertEqual(resultaten[0], resultaten[1])
        bronnen = opslag.laden(vers=True)["werkbronnen"]
        self.assertEqual(len(bronnen), 1)
        opslag.gebruik_account("bob", "test-only")
        self.assertFalse(opslag.laden(vers=True).get("werkbronnen"))
        with self.assertRaises(ValueError):
            opslag.werkbron_opslaan("bob", "taak", taak["id"], {"soort": "notitie", "titel": "Test", "tekst": "Geen doel"})
        bron_id = next(iter(bronnen))
        opslag.werkbron_verwijderen(bron_id, bronnen[bron_id])
        opslag.gebruik_account("alice", "test-only")
        self.assertEqual(opslag.laden(vers=True)["werkbronnen"], bronnen)

    def test_meerdaagse_planner_concurrentie_bewaart_geen_halve_plannen(self):
        a = opslag.taak_toevoegen("Taak A", minuten=60)
        b = opslag.taak_toevoegen("Taak B", minuten=60)
        barriere = threading.Barrier(2)
        lokaal = threading.local()
        def tegelijk(functie, **parameters):
            antwoord = self.rpc(functie, **parameters)
            if functie == "mijn_gegevens" and not getattr(lokaal, "gelezen", False):
                lokaal.gelezen = True
                barriere.wait(timeout=10)
            return antwoord
        def bevestig(taak):
            opslag.gebruik_account("alice", "test-only")
            plan = [{"taak_id": taak["id"], "titel": taak["titel"], "deadline": None,
                     "blokken": [{"start": "2030-01-07T10:00", "einde": "2030-01-07T11:00"}]}]
            try:
                return opslag.focusplan_bevestigen("focus-" + str(taak["id"]), plan)
            except ValueError:
                return None
        with ThreadPoolExecutor(max_workers=2) as pool, patch.object(opslag, "_slot", threading.Semaphore(2)), \
                patch.object(opslag, "_rpc", side_effect=tegelijk), patch.object(dagplan, "nu", return_value=datetime(2030, 1, 7, 9)):
            resultaten = list(pool.map(bevestig, [a, b]))
        self.assertEqual(sum(r is not None for r in resultaten), 1)
        g = opslag.laden(vers=True)
        self.assertEqual(len(g["afspraken"]), 1)
        self.assertEqual(len(g["intentie_ontvangst"]), 1)

    def test_bronbundel_concurrent_herstel_en_accounts_blijven_gescheiden(self):
        import planning_backup, werkcontext
        t=opslag.taak_toevoegen("Werkbundel",minuten=30)
        opslag.werkbron_opslaan("n","taak",t["id"],{"soort":"notitie","titel":"Resultaat","tekst":"Alleen eigen account"})
        g=opslag.laden(vers=True)
        data=planning_backup.exporteer(g,bronnen=True)
        basis=planning_backup.vingerafdruk(g)
        barriere=threading.Barrier(2)
        lokaal=threading.local()
        def tegelijk(functie,**parameters):
            antwoord=self.rpc(functie,**parameters)
            if functie=="mijn_gegevens" and not getattr(lokaal,"gelezen",False):
                lokaal.gelezen=True
                barriere.wait(timeout=10)
            return antwoord
        def voeg_toe(_):
            opslag.gebruik_account("alice","test-only")
            return opslag.planning_herstellen("bundel",data,basis)
        with ThreadPoolExecutor(max_workers=2) as pool,patch.object(opslag,"_slot",threading.Semaphore(2)), \
                patch.object(opslag,"_rpc",side_effect=tegelijk):
            resultaten=list(pool.map(voeg_toe,range(2)))
        self.assertEqual(resultaten[0],resultaten[1])
        g=opslag.laden(vers=True)
        self.assertEqual(len(g["taken"]),2)
        self.assertEqual(len(g["werkbronnen"]),2)
        self.assertEqual(len(werkcontext.samenhang(g,"taak",g["taken"][-1]["id"])["bronnen"]),1)
        opslag.gebruik_account("bob","test-only")
        with self.assertRaises(ValueError):
            werkcontext.samenhang(opslag.laden(vers=True),"taak",t["id"])
        self.assertFalse(opslag.laden(vers=True).get("werkbronnen"))

    def test_communicatie_blijft_accountgebonden_en_retries_dubbelen_niet(self):
        import communicatie
        inhoud = {"kanaal": "Bericht", "ontvanger": "Privé", "onderwerp": "Overleg", "tekst": "Alleen Alice"}
        basis = communicatie.vingerafdruk(communicatie.lezen())
        eerste = communicatie.wijzigen("a" * 32, "bewaren", inhoud, basis)
        self.assertEqual(communicatie.wijzigen("a" * 32, "bewaren", inhoud, basis), eerste)
        opslag.gebruik_account("bob", "test-only")
        self.assertFalse(communicatie.lezen()["concepten"])
        self.assertFalse(communicatie.lezen()["voorkeuren"]["ai_hulp"])
        communicatie.wijzigen("a" * 32, "bewaren", {**inhoud, "tekst": "Alleen Bob"},
                               communicatie.vingerafdruk(communicatie.lezen()))
        opslag.gebruik_account("alice", "test-only")
        self.assertEqual(communicatie.lezen()["concepten"]["a" * 32]["tekst"], "Alleen Alice")
        opslag.gebruik_account("alice", "ongeldig")
        with self.assertRaises(opslag.GeenToegang):
            communicatie.lezen()

    def test_bronwijziging_na_bundelvoorbeeld_blokkeert_herstel(self):
        import planning_backup
        t=opslag.taak_toevoegen("Dossier",minuten=30)
        opslag.werkbron_opslaan("a","taak",t["id"],{"soort":"notitie","titel":"Bron","tekst":"Eerste"})
        g=opslag.laden(vers=True);basis=planning_backup.vingerafdruk(g)
        data=planning_backup.exporteer(g,bronnen=True)
        opslag.werkbron_opslaan("b","taak",t["id"],{"soort":"notitie","titel":"Nieuw","tekst":"Later toegevoegd"})
        voor=opslag.laden(vers=True)
        with self.assertRaises(ValueError):
            opslag.planning_herstellen("stale",data,basis)
        self.assertEqual(opslag.laden(vers=True),voor)


if __name__ == "__main__":
    unittest.main()
