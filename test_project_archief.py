"""Echte PostgreSQL-controle van het onafhankelijke versleutelde projectarchief."""
import json
import os
from pathlib import Path
import subprocess
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor


@unittest.skipUnless(os.environ.get("ASSISTENT_TEST_POSTGRES_CONTAINER"), "Geïsoleerde PostgreSQL-testcontainer vereist")
class ProjectArchiefTest(unittest.TestCase):
    @classmethod
    def sql(cls, tekst, database=None):
        omgeving = {k:v for k,v in os.environ.items() if k not in {"DOCKER_HOST","DOCKER_CONTEXT","DOCKER_TLS","DOCKER_TLS_VERIFY","DOCKER_CERT_PATH"}}
        r = subprocess.run(["docker","--host=unix:///var/run/docker.sock","exec","-i",os.environ["ASSISTENT_TEST_POSTGRES_CONTAINER"],
            "psql","-U","postgres","-d",database or cls.database,"-XqAt","-v","ON_ERROR_STOP=1"],
            input=tekst,text=True,capture_output=True,check=True,env=omgeving,timeout=20)
        return r.stdout.strip()

    @classmethod
    def setUpClass(cls):
        cls.database = "project_archief_" + uuid.uuid4().hex
        cls.sql(f'create database "{cls.database}";', "postgres")
        cls.addClassCleanup(lambda:cls.sql(f'drop database "{cls.database}" with(force);',"postgres"))
        cls.sql("""
          do $$ begin if not exists(select from pg_roles where rolname='anon') then create role anon; end if;
            if not exists(select from pg_roles where rolname='authenticated') then create role authenticated; end if; end $$;
          create schema private;
          create table private.gebruikers(id bigint primary key);
          insert into private.gebruikers values(1),(2),(3);
          create table private.chat_gesprekken(id bigint primary key,soort text,weg boolean,alleen_beheer boolean);
          insert into private.chat_gesprekken values(9,'groep',false,false),(10,'groep',false,true);
          create table private.chat_leden(gesprek bigint,gebruiker bigint,status text);
          insert into private.chat_leden values(9,1,'lid'),(9,2,'lid'),(10,1,'lid'),(10,2,'lid');
          create table private.chat_apparaten(id bigint primary key,gebruiker bigint,weg boolean,teken jsonb);
          insert into private.chat_apparaten values(11,1,false,'{}'),(22,2,false,'{}'),(33,3,false,'{}');
          create table private.chat_berichten(id bigint primary key,inhoud text);
          create function private.gebruiker_id(text,text) returns bigint language sql as $$
            select case when $2='test-only' then case $1 when 'alice' then 1 when 'bob' then 2 when 'ander' then 3 end end::bigint $$;
          create function private.chat_lid(bigint,bigint) returns text language sql as $$ select status from private.chat_leden where gebruiker=$1 and gesprek=$2 $$;
          create function private.chat_mag_beheren(bigint,bigint) returns boolean language sql as $$ select $1=1 $$;
          create function private.chat_geblokkeerd(bigint,bigint) returns boolean language sql as $$ select false $$;
        """)
        migratie=Path(__file__).with_name("sql").joinpath("project_archief.sql").read_text()
        cls.sql(migratie); cls.sql(migratie)

    def setUp(self):
        self.sql("truncate private.project_archief restart identity; update private.chat_leden set status='lid';")
        self.bestand="00000000-0000-4000-8000-000000000001"
        self.opdracht=str(uuid.uuid4())

    def rpc(self, functie, naam="alice", wachtwoord="test-only", **params):
        waarden={"p_naam":naam,"p_wachtwoord":wachtwoord,"p_gesprek":9,**params}
        args=[]
        for k,v in waarden.items():
            inhoud=json.dumps(v) if isinstance(v,dict) else str(v)
            lit="'"+inhoud.replace("'","''")+"'"+('::jsonb' if isinstance(v,dict) else '')
            args.append(k+"=>"+lit)
        return json.loads(self.sql("set role anon; select public."+functie+"("+",".join(args)+");"))

    def bewaar(self, **extra):
        return self.rpc("project_archief_bewaren",p_bestand=self.bestand,p_opdracht=self.opdracht,p_apparaat=extra.pop("p_apparaat",11),
            p_inhoud=extra.pop("p_inhoud","ciphertext"),p_iv="iv",p_epk={},p_sleutels={"11":{"w":"alice"},"22":{"w":"bob"}},p_handtekening="signatuur",**extra)

    def test_idempotent_en_inhoudgebonden(self):
        eerste=self.bewaar(); self.assertEqual(eerste,self.bewaar())
        self.assertIn("fout",self.bewaar(p_inhoud="andere-ciphertext"))
        self.assertEqual(self.sql("select count(*) from private.project_archief;"),"1")

    def test_gelijktijdig_dezelfde_archiefopdracht_is_een_versie(self):
        with ThreadPoolExecutor(max_workers=2) as pool: uit=list(pool.map(lambda _:self.bewaar(),range(2)))
        self.assertEqual(uit[0],uit[1]); self.assertEqual(self.sql("select count(*) from private.project_archief;"),"1")

    def test_niet_lid_en_ongeldige_auth_geen_toegang(self):
        self.assertIn("fout",self.bewaar(naam="ander"))
        self.assertIn("fout",self.bewaar(wachtwoord="ongeldig"))
        self.assertIn("fout",self.rpc("project_archief_lijst",naam="ander",p_bestand=self.bestand))

    def test_alleen_beheer_en_eigen_apparaat(self):
        self.assertIn("fout",self.bewaar(naam="bob",p_gesprek=10,p_apparaat=22))
        self.assertIn("id",self.bewaar(p_gesprek=10))
        id=self.bewaar()["id"]
        self.assertIn("fout",self.rpc("project_archief_lezen",naam="bob",p_id=id,p_apparaat=11))

    def test_lezen_biedt_alleen_eigen_ingepakte_sleutel(self):
        id=self.bewaar()["id"]
        gelezen=self.rpc("project_archief_lezen",naam="bob",p_id=id,p_apparaat=22)
        self.assertEqual(gelezen["sleutel"],{"w":"bob"}); self.assertNotIn("sleutels",gelezen)
        self.sql("update private.chat_leden set status='weg' where gebruiker=2;")
        self.assertIn("fout",self.rpc("project_archief_lezen",naam="bob",p_id=id,p_apparaat=22))

    def test_chatwissen_wist_het_aparte_archief_niet(self):
        id=self.bewaar()["id"]
        self.sql("insert into private.chat_berichten values(1,'versleuteld'); delete from private.chat_berichten;")
        self.assertEqual(self.rpc("project_archief_lezen",p_id=id,p_apparaat=11)["inhoud"],"ciphertext")
        self.assertEqual(self.rpc("project_archief_bestanden")["bestanden"][0]["bestand"],self.bestand)
        self.assertIn("fout",self.rpc("project_archief_bestanden",naam="ander"))

    def test_lijst_is_begrensd_en_bevat_geen_ciphertext(self):
        for _ in range(22): self.opdracht=str(uuid.uuid4()); self.bewaar()
        pagina=self.rpc("project_archief_lijst",p_bestand=self.bestand)["versies"]
        self.assertEqual(len(pagina),20); self.assertNotIn("inhoud",pagina[0])
        ouder=self.rpc("project_archief_lijst",p_bestand=self.bestand,p_voor=pagina[-1]["id"])["versies"]
        self.assertEqual(len(ouder),2)

    def test_directe_tabeltoegang_geweigerd(self):
        with self.assertRaises(subprocess.CalledProcessError): self.sql("set role anon; select * from private.project_archief;")

    def test_quota_en_ongeldige_inhoud_worden_geweigerd(self):
        self.assertIn("fout",self.bewaar(p_inhoud=""))
        self.bewaar()
        self.sql("""insert into private.project_archief(gesprek,bestand,opdracht,afzender,apparaat,inhoud,iv,epk,sleutels,handtekening)
          select a.gesprek,a.bestand,md5(i::text)::uuid,a.afzender,a.apparaat,a.inhoud,a.iv,a.epk,a.sleutels,a.handtekening
          from private.project_archief a cross join generate_series(1,199) i where a.id=1;""")
        self.opdracht=str(uuid.uuid4())
        self.assertIn("200",self.bewaar()["fout"])
        self.assertEqual(self.sql("select count(*) from private.project_archief;"),"200")

    def test_explicit_verwijderen_project_volgt_de_cascaderegels(self):
        self.bewaar()
        uit=self.sql("begin; delete from private.chat_gesprekken where id=9; select count(*) from private.project_archief; rollback;")
        self.assertEqual(uit,"0")

    def test_archief_begrenst_ook_het_aantal_bestanden(self):
        self.bewaar()
        self.sql("""insert into private.project_archief(gesprek,bestand,opdracht,afzender,apparaat,inhoud,iv,epk,sleutels,handtekening)
          select a.gesprek,md5('bestand-'||i)::uuid,md5('opdracht-'||i)::uuid,a.afzender,a.apparaat,a.inhoud,a.iv,a.epk,a.sleutels,a.handtekening
          from private.project_archief a cross join generate_series(1,49) i where a.id=1;""")
        self.bestand=str(uuid.uuid4()); self.opdracht=str(uuid.uuid4())
        self.assertIn("50",self.bewaar()["fout"])


if __name__=="__main__": unittest.main()
