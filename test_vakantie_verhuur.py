"""Werkelijke verhuur-RPC's op een eigen database; geen productie of betaalprovider."""
from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import subprocess
import unittest
import uuid


@unittest.skipUnless(os.environ.get("ASSISTENT_TEST_POSTGRES_CONTAINER"), "Eigen PostgreSQL-container vereist")
class VakantieVerhuurTests(unittest.TestCase):
    @classmethod
    def sql(cls, tekst, database=None):
        env = {k:v for k,v in os.environ.items() if k not in {"DOCKER_HOST","DOCKER_CONTEXT","DOCKER_TLS","DOCKER_TLS_VERIFY","DOCKER_CERT_PATH"}}
        r = subprocess.run(["docker","--host=unix:///var/run/docker.sock","exec","-i",os.environ["ASSISTENT_TEST_POSTGRES_CONTAINER"],"psql","-U","postgres","-d",database or cls.database,"-XqAt","-v","ON_ERROR_STOP=1"],input=tekst,text=True,capture_output=True,env=env,timeout=25)
        if r.returncode: raise AssertionError(r.stderr)
        return r.stdout.strip()

    @classmethod
    def setUpClass(cls):
        cls.database="vakantie_"+uuid.uuid4().hex
        cls.sql(f'create database "{cls.database}"',"postgres")
        cls.addClassCleanup(lambda:cls.sql(f'drop database "{cls.database}" with(force)',"postgres"))
        cls.sql("""
         do $$ begin if not exists(select from pg_roles where rolname='anon') then create role anon; end if;
         if not exists(select from pg_roles where rolname='authenticated') then create role authenticated; end if; end $$;
         create schema private;
         create table private.gebruikers(id bigint primary key,naam text,geblokkeerd boolean default false,verwijderd boolean default false);
         create function private.gebruiker_id(text,text) returns bigint language sql as $$ select id from private.gebruikers where naam=$1 and $2='test-only' and not geblokkeerd and not verwijderd $$;
        """)
        cls.sql((Path(__file__).parent/'sql/vakantie_verhuur.sql').read_text())

    def setUp(self):
        self.sql("truncate private.vakantie_reserveringen,private.vakantie_verblijven,private.gebruikers cascade; insert into private.gebruikers(id,naam) values(1,'host'),(2,'gast'),(3,'ander');")
        self.id="00000000-0000-4000-8000-000000000001"
        self.a="00000000-0000-4000-8000-000000000002"
        self.b="00000000-0000-4000-8000-000000000003"
        self.data=dict(titel="Rustig vakantiehuis",plaats="Testplaats",land="Nederland",adres="Privéstraat 42",beschrijving="Een volledig ingerichte woning voor je vakantie.",regels="Aankomst 15 uur, vertrek 10 uur. Kosteloos annuleren tot zeven dagen vooraf. Geen borg.",prijs=10000,schoonmaak=5000,personen=4,van="2030-01-01",tot="2030-12-31",voorzieningen=["wifi","keuken"],open=True,gerechtigd=True)
        self.assertIn('verblijf',self.save())

    def call(self,fn,args): return json.loads(self.sql(f"select public.{fn}({args})"))
    def save(self,changes=None,who="host",version=0):
        d={**self.data,**(changes or {})}; q=json.dumps(d).replace("'","''")
        return self.call('vakantie_verblijf_bewaren',f"'{who}','test-only','{self.id}',{version},'{q}'::jsonb")
    def request(self,id=None,who="gast",van="2030-05-01",tot="2030-05-05",version=1,persons=2):
        return self.call('vakantie_aanvragen',f"'{who}','test-only','{id or self.a}','{self.id}',{version},'{van}','{tot}',{persons}")
    def action(self,id=None,who="host",action="bevestigen"):
        return self.call('vakantie_reservering_actie',f"'{who}','test-only','{id or self.a}','{action}'")
    def overview(self,who): return self.call('mijn_vakantie_verhuur',f"'{who}','test-only'")
    def search(self): return self.call('vakantie_verblijven_zoeken',"'gast','test-only','2030-05-01','2030-05-05',2,''")

    def test_search_never_leaks_exact_address_or_owner_id(self):
        r=self.search()['verblijven'][0]
        self.assertNotIn('adres',r); self.assertNotIn('eigenaar',r)
        self.assertNotIn('Privéstraat',json.dumps(r))

    def test_address_only_visible_after_confirmation_and_only_to_participants(self):
        self.request()
        self.assertIsNone(self.overview('gast')['reserveringen'][0]['adres'])
        self.action()
        self.assertEqual(self.overview('gast')['reserveringen'][0]['adres'],'Privéstraat 42')
        self.assertEqual(self.overview('ander')['reserveringen'],[])
        self.action(who='gast',action='annuleren')
        self.assertIsNone(self.overview('gast')['reserveringen'][0]['adres'])

    def test_total_is_computed_by_server_and_request_retry_is_idempotent(self):
        r=self.request(); self.assertEqual(r['totaal'],45000)
        self.assertEqual(self.request()['id'],r['id'])
        self.assertEqual(self.sql('select count(*) from private.vakantie_reserveringen'),'1')
        self.assertIn('fout',self.request(tot='2030-05-06'))

    def test_price_or_rules_change_requires_new_request(self):
        self.request(); self.save({'prijs':20000},version=1)
        self.assertIn('fout',self.action())
        r=self.overview('gast')['reserveringen'][0]
        self.assertEqual(r['totaal'],45000)
        self.assertIn('Kosteloos',r['voorwaarden'])

    def test_only_host_may_accept_and_other_users_cannot_cancel(self):
        self.request(); self.assertIn('fout',self.action(who='gast'))
        self.assertIn('fout',self.action(who='ander',action='annuleren'))
        self.assertEqual(self.action()['status'],'bevestigd')
        self.assertEqual(self.action()['status'],'bevestigd')

    def test_concurrent_acceptance_never_double_books(self):
        self.request(); self.request(id=self.b,who='ander')
        with ThreadPoolExecutor(max_workers=2) as pool:
            r=list(pool.map(lambda x:self.action(id=x),[self.a,self.b]))
        self.assertEqual(sum(x.get('status')=='bevestigd' for x in r),1)
        self.assertEqual(self.sql("select count(*) from private.vakantie_reserveringen where status='bevestigd'"),'1')

    def test_checkout_date_is_available_to_next_guest(self):
        self.request(); self.action()
        self.assertEqual(self.request(id=self.b,who='ander',van='2030-05-05',tot='2030-05-07')['status'],'aangevraagd')
        self.assertEqual(self.action(id=self.b)['status'],'bevestigd')

    def test_cancelled_stay_releases_dates_without_fake_refund(self):
        self.request(); self.action()
        self.assertEqual(self.search()['verblijven'],[])
        r=self.action(who='gast',action='annuleren')
        self.assertEqual(r['status'],'geannuleerd'); self.assertNotIn('betaald',r)
        self.assertEqual(len(self.search()['verblijven']),1)
        self.assertIn('fout',self.action())

    def test_listing_edits_enforce_owner_and_version(self):
        self.assertIn('fout',self.save(who='gast',version=1))
        self.assertIn('fout',self.save({'prijs':20000},version=0))
        self.assertIn('verblijf',self.save({'open':False},version=1))
        self.assertEqual(self.search()['verblijven'],[])

    def test_malformed_capacity_dates_and_rights_are_rejected(self):
        for changes in ({'personen':0},{'prijs':0},{'van':'2030-02-30'},{'tot':'2030-01-01'},{'gerechtigd':False},{'voorzieningen':['onbekend']}):
            with self.subTest(changes=changes): self.assertIn('fout',self.save(changes,version=1))
        for van,tot,n in [('2030-05-01','2030-05-01',2),('2030-05-01','2030-09-01',2),('2030-05-01','2030-05-02',5)]:
            self.assertIn('fout',self.request(van=van,tot=tot,persons=n))

    def test_deleted_or_blocked_host_cannot_be_booked(self):
        self.sql('update private.gebruikers set geblokkeerd=true where id=1')
        self.assertEqual(self.search()['verblijven'],[])
        self.assertIn('fout',self.request())

    def test_delete_refuses_future_confirmed_and_rejects_pending(self):
        self.request(); self.action()
        args=f"'host','test-only','{self.id}',1"
        self.assertIn('fout',self.call('vakantie_verblijf_verwijderen',args))
        self.action(who='gast',action='annuleren')
        self.request(id=self.b,who='ander')
        self.assertTrue(self.call('vakantie_verblijf_verwijderen',args)['ok'])
        self.assertEqual(self.overview('ander')['reserveringen'][0]['status'],'afgewezen')
        self.assertEqual(self.search()['verblijven'],[])

    def test_deleted_account_removes_address_and_cancels_requests(self):
        self.request(); self.action()
        self.sql('update private.gebruikers set verwijderd=true where id=1')
        self.assertEqual(self.search()['verblijven'],[])
        self.assertEqual(self.sql("select adres from private.vakantie_verblijven where eigenaar=1"),'')
        r=self.overview('gast')['reserveringen'][0]
        self.assertIsNone(r['adres']); self.assertEqual(r['status'],'geannuleerd')

    def test_repeating_listing_save_after_lost_response_does_not_create_or_increment(self):
        self.assertIn('verblijf',self.save())
        self.assertEqual(self.sql('select count(*) from private.vakantie_verblijven'),'1')
        self.assertEqual(self.sql('select versie from private.vakantie_verblijven'),'1')
        self.save({'prijs':12000},version=1)
        self.save({'prijs':12000},version=1)
        self.assertEqual(self.sql('select versie from private.vakantie_verblijven'),'2')
        self.assertIn('fout',self.save(version=0))

    def test_self_booking_and_second_pending_overlap_are_rejected(self):
        self.assertIn('fout',self.request(who='host'))
        self.request()
        self.assertIn('fout',self.request(id=self.b))

    def test_owner_blocks_nights_and_only_owner_can_unblock(self):
        args=f"'host','test-only','{self.b}','{self.id}','2030-05-01','2030-05-05'"
        self.assertTrue(self.call('vakantie_blokkade_bewaren',args)["ok"])
        self.assertTrue(self.call('vakantie_blokkade_bewaren',args)["ok"])
        self.assertEqual(self.search()['verblijven'],[])
        self.assertIn('fout',self.request())
        self.assertIn('fout',self.call('vakantie_blokkade_bewaren',args.replace("'host'","'gast'")+",true"))
        self.assertTrue(self.call('vakantie_blokkade_bewaren',args+",true")['ok'])
        self.assertEqual(len(self.search()['verblijven']),1)

    def test_pending_request_cannot_accept_blocked_nights_and_confirmed_nights_cannot_be_blocked(self):
        self.request()
        args=f"'host','test-only','{self.b}','{self.id}','2030-05-01','2030-05-05'"
        self.call('vakantie_blokkade_bewaren',args)
        self.assertIn('fout',self.action())
        self.call('vakantie_blokkade_bewaren',args+",true")
        self.action()
        self.assertIn('fout',self.call('vakantie_blokkade_bewaren',args))

    def test_concurrent_block_and_acceptance_cannot_both_succeed(self):
        self.request()
        args=f"'host','test-only','{self.b}','{self.id}','2030-05-01','2030-05-05'"
        with ThreadPoolExecutor(max_workers=2) as pool:
            a=pool.submit(self.action)
            b=pool.submit(self.call,'vakantie_blokkade_bewaren',args)
            results=[a.result(),b.result()]
        self.assertEqual(sum(x.get('ok') is True for x in results),1)
        self.assertEqual(self.sql("select (select count(*) from private.vakantie_blokkades)+(select count(*) from private.vakantie_reserveringen where status='bevestigd')"),'1')

    def test_limits_pending_and_daily_requests(self):
        self.sql(f"insert into private.vakantie_reserveringen(id,verblijf,gast,versie,van,tot,personen,totaal,voorwaarden) select md5(i::text)::uuid,'{self.id}',2,1,'2030-01-01','2030-01-02',1,10000,'test' from generate_series(1,20) i")
        self.assertIn('twintig',self.request()['fout'])
        self.sql("update private.vakantie_reserveringen set status='geannuleerd'")
        self.sql(f"insert into private.vakantie_reserveringen(id,verblijf,gast,versie,van,tot,personen,totaal,voorwaarden,status) select md5(i::text)::uuid,'{self.id}',2,1,'2030-01-01','2030-01-02',1,10000,'test','geannuleerd' from generate_series(21,30) i")
        self.assertIn('dertig',self.request()['fout'])

    def test_search_sorts_total_stay_price_including_cleaning(self):
        second="00000000-0000-4000-8000-000000000099"
        self.sql(f"insert into private.vakantie_verblijven select '{second}'::uuid,eigenaar,versie,'Goedkoper totaal',plaats,land,beschrijving,adres,regels,12000,0,personen,van,tot,voorzieningen,open,weg from private.vakantie_verblijven where id='{self.id}'")
        # Vier nachten: 4*10000+5000=45000 versus 4*12000=48000.
        self.assertEqual(self.search()['verblijven'][0]['id'],self.id)
        # Eén nacht: 10000+5000=15000 versus 12000. De andere woning hoort nu eerst.
        r=self.call('vakantie_verblijven_zoeken',"'gast','test-only','2030-05-01','2030-05-02',2,''")
        self.assertEqual(r['verblijven'][0]['id'],second)

    def test_search_accepts_place_country_from_trip_with_comma_accents_and_spacing(self):
        self.sql("update private.vakantie_verblijven set plaats='Évora',land='Portugal'")
        r=self.call('vakantie_verblijven_zoeken',"'gast','test-only','2030-05-01','2030-05-02',2,'  EVORA,   Portugal  '")
        self.assertEqual(len(r['verblijven']),1)
        self.assertEqual(self.call('vakantie_verblijven_zoeken',"'gast','test-only','2030-05-01','2030-05-02',2,'Andere plaats'")['verblijven'],[])

    def test_no_table_access_and_invalid_session_cannot_read(self):
        self.assertTrue(self.call('mijn_vakantie_verhuur',"'host','wrong'")['geen_toegang'])
        with self.assertRaises(AssertionError): self.sql('set role anon; select * from private.vakantie_verblijven')
        with self.assertRaises(AssertionError): self.sql('set role authenticated; select * from private.vakantie_reserveringen')

if __name__=='__main__': unittest.main()
