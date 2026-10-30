-- Particuliere verblijven; na het basisschema met private.gebruikers/gebruiker_id.
-- Geen betaalprovider, verzekering of automatische uitbetaling. EUR-bedragen zijn prijsafspraken.
begin;
create table if not exists private.vakantie_verblijven (
 id uuid primary key, eigenaar bigint not null references private.gebruikers(id) on delete cascade,
 versie integer not null default 1, titel text not null, plaats text not null, land text not null,
 beschrijving text not null, adres text not null, regels text not null,
 prijs integer not null check(prijs between 100 and 1000000), schoonmaak integer not null check(schoonmaak between 0 and 1000000),
 personen integer not null check(personen between 1 and 30),
 van date not null, tot date not null check(tot>van and tot<=van+730),
 voorzieningen text[] not null default '{}', open boolean not null default false, weg boolean not null default false
);
create table if not exists private.vakantie_reserveringen (
 id uuid primary key, verblijf uuid not null references private.vakantie_verblijven(id) on delete cascade,
 gast bigint not null references private.gebruikers(id) on delete cascade,
 versie integer not null, van date not null, tot date not null check(tot>van and tot<=van+90),
 personen integer not null check(personen between 1 and 30),
 totaal integer not null, voorwaarden text not null, adres text,
 status text not null default 'aangevraagd' check(status in ('aangevraagd','bevestigd','afgewezen','geannuleerd')),
 aangemaakt timestamptz not null default now()
);
create table if not exists private.vakantie_blokkades (
 id uuid primary key, verblijf uuid not null references private.vakantie_verblijven(id) on delete cascade,
 van date not null, tot date not null check(tot>van and tot<=van+730)
);
alter table private.vakantie_blokkades enable row level security;
revoke all on private.vakantie_blokkades from public,anon,authenticated;
create index if not exists vakantie_bezet on private.vakantie_reserveringen(verblijf,van,tot) where status='bevestigd';
alter table private.vakantie_verblijven enable row level security;
alter table private.vakantie_reserveringen enable row level security;
revoke all on private.vakantie_verblijven,private.vakantie_reserveringen from public,anon,authenticated;

create or replace function private.vakantie_json(v private.vakantie_verblijven, eigen boolean default false)
returns jsonb language sql stable set search_path to '' as $$
 select jsonb_build_object('id',v.id,'versie',v.versie,'titel',v.titel,'plaats',v.plaats,'land',v.land,
  'beschrijving',v.beschrijving,'regels',v.regels,'prijs',v.prijs,'schoonmaak',v.schoonmaak,'personen',v.personen,
  'van',v.van,'tot',v.tot,'voorzieningen',v.voorzieningen,'open',v.open,'weg',v.weg)
  || case when eigen then jsonb_build_object('adres',v.adres) else '{}'::jsonb end
$$;
revoke all on function private.vakantie_json(private.vakantie_verblijven,boolean) from public,anon,authenticated;

create or replace function private.vakantie_zoektekst(p_tekst text)
returns text language sql immutable set search_path to '' as $$
 select regexp_replace(translate(lower(trim(coalesce(p_tekst,''))),
 'àáâäãåèéêëìíîïòóôöõùúûüçñ','aaaaaaeeeeiiiiooooouuuucn'),'[[:space:],;]+',' ','g')
$$;
revoke all on function private.vakantie_zoektekst(text) from public,anon,authenticated;

create or replace function public.vakantie_verblijven_zoeken(p_naam text,p_wachtwoord text,p_van date,p_tot date,p_personen integer,p_plek text default '')
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare ik bigint:=private.gebruiker_id(p_naam,p_wachtwoord);
begin
 if ik is null then return jsonb_build_object('geen_toegang',true); end if;
 if p_van is null or p_tot is null or p_personen is null or p_van < (now() at time zone 'Europe/Amsterdam')::date or p_tot<=p_van or p_tot>p_van+90 or p_personen not between 1 and 30 or coalesce(length(p_plek),0)>160 then return jsonb_build_object('fout','Controleer datums, gasten en plaats.'); end if;
 return jsonb_build_object('verblijven',coalesce((select jsonb_agg(x.j) from (
  select private.vakantie_json(v,false) j from private.vakantie_verblijven v join private.gebruikers g on g.id=v.eigenaar
  where v.open and not v.weg and not g.geblokkeerd and not g.verwijderd and v.eigenaar<>ik
    and v.personen>=p_personen and v.van<=p_van and v.tot>=p_tot
    and (private.vakantie_zoektekst(p_plek)='' or position(private.vakantie_zoektekst(p_plek) in private.vakantie_zoektekst(v.plaats||' '||v.land))>0)
    and not exists(select 1 from private.vakantie_blokkades b where b.verblijf=v.id and b.van<p_tot and b.tot>p_van)
    and not exists(select 1 from private.vakantie_reserveringen r where r.verblijf=v.id and r.status='bevestigd' and r.van<p_tot and r.tot>p_van)
  order by (p_tot-p_van)*v.prijs+v.schoonmaak,v.id limit 50) x),'[]'::jsonb));
end; $$;

create or replace function public.mijn_vakantie_verhuur(p_naam text,p_wachtwoord text)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare ik bigint:=private.gebruiker_id(p_naam,p_wachtwoord);
begin
 if ik is null then return jsonb_build_object('geen_toegang',true); end if;
 return jsonb_build_object('verblijven',coalesce((select jsonb_agg(private.vakantie_json(v,true) order by v.id) from private.vakantie_verblijven v where v.eigenaar=ik and not v.weg),'[]'::jsonb),
 'blokkades',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'verblijf',b.verblijf,'van',b.van,'tot',b.tot) order by b.van) from private.vakantie_blokkades b join private.vakantie_verblijven v on v.id=b.verblijf where v.eigenaar=ik and not v.weg),'[]'::jsonb),
 'reserveringen',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'verblijf',r.verblijf,'titel',v.titel,'plaats',v.plaats,'van',r.van,'tot',r.tot,
 'personen',r.personen,'totaal',r.totaal,'voorwaarden',r.voorwaarden,'status',r.status,'verhuurder',v.eigenaar=ik,
 'contact',case when r.gast=ik then host.naam else gast.naam end,
 'adres',case when r.status='bevestigd' then r.adres else null end) order by r.aangemaakt desc)
 from private.vakantie_reserveringen r join private.vakantie_verblijven v on v.id=r.verblijf
 join private.gebruikers host on host.id=v.eigenaar join private.gebruikers gast on gast.id=r.gast
 where r.gast=ik or v.eigenaar=ik),'[]'::jsonb));
end; $$;

create or replace function public.vakantie_verblijf_bewaren(p_naam text,p_wachtwoord text,p_id uuid,p_versie integer,p_data jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare ik bigint:=private.gebruiker_id(p_naam,p_wachtwoord); oud private.vakantie_verblijven; v private.vakantie_verblijven; d jsonb:=p_data; voorzieningen text[];
begin
 if ik is null then return jsonb_build_object('geen_toegang',true); end if;
 if p_id is null or p_versie is null or jsonb_typeof(d) is distinct from 'object' or length(d::text)>12000
 or d->>'gerechtigd' is distinct from 'true' then return jsonb_build_object('fout','Bevestig dat je deze woning mag aanbieden.'); end if;
 if coalesce(length(trim(d->>'titel')),0) not between 3 and 100 or coalesce(length(trim(d->>'plaats')),0) not between 2 and 160
 or coalesce(length(trim(d->>'land')),0) not between 2 and 80 or coalesce(length(trim(d->>'adres')),0) not between 5 and 300
 or coalesce(length(trim(d->>'beschrijving')),0) not between 20 and 3000 or coalesce(length(trim(d->>'regels')),0) not between 20 and 2000
 or coalesce(d->>'prijs','')!~'^[0-9]{1,7}$' or coalesce(d->>'schoonmaak','')!~'^[0-9]{1,7}$'
 or coalesce(d->>'personen','')!~'^[0-9]{1,2}$' or coalesce(d->>'van','')!~'^\d{4}-\d{2}-\d{2}$' or coalesce(d->>'tot','')!~'^\d{4}-\d{2}-\d{2}$'
 or jsonb_typeof(d->'open') is distinct from 'boolean' or jsonb_typeof(d->'voorzieningen') is distinct from 'array' then
 return jsonb_build_object('fout','Vul de woning, prijzen, datums en voorwaarden volledig in.'); end if;
 if jsonb_array_length(d->'voorzieningen')>10 then return jsonb_build_object('fout','Kies maximaal tien voorzieningen.'); end if;
 select array_agg(x) into voorzieningen from jsonb_array_elements_text(d->'voorzieningen') x;
 voorzieningen:=coalesce(voorzieningen,'{}');
 if exists(select 1 from unnest(voorzieningen) x where x not in ('wifi','keuken','wasmachine','werkplek','huisdieren','kindvriendelijk','rolstoeltoegankelijk','parkeren','rustig','laadpunt')) then return jsonb_build_object('fout','Onbekende voorziening.'); end if;
 -- Ook nieuwe listings van dezelfde eigenaar serialiseren voor de limiet.
 perform 1 from private.gebruikers where id=ik for update;
 select * into oud from private.vakantie_verblijven where id=p_id for update;
 if found and (oud.eigenaar<>ik or oud.weg) then return jsonb_build_object('fout','Dit verblijf is niet beschikbaar.'); end if;
 if oud.id is not null and oud.versie=p_versie+1 and
  (oud.titel,oud.plaats,oud.land,oud.adres,oud.beschrijving,oud.regels,oud.prijs,oud.schoonmaak,oud.personen,oud.van,oud.tot,oud.voorzieningen,oud.open)
  is not distinct from
  (trim(d->>'titel'),trim(d->>'plaats'),trim(d->>'land'),trim(d->>'adres'),trim(d->>'beschrijving'),trim(d->>'regels'),
   (d->>'prijs')::integer,(d->>'schoonmaak')::integer,(d->>'personen')::integer,(d->>'van')::date,(d->>'tot')::date,voorzieningen,(d->>'open')::boolean)
 then return jsonb_build_object('verblijf',private.vakantie_json(oud,true)); end if;
 if oud.id is not null and oud.versie<>p_versie then return jsonb_build_object('fout','Het aanbod is gewijzigd. Vernieuw eerst.'); end if;
 if oud.id is null and (p_versie<>0 or (select count(*) from private.vakantie_verblijven where eigenaar=ik and not weg)>=10) then return jsonb_build_object('fout','Maximaal tien verblijven. Vernieuw je aanbod.'); end if;
 insert into private.vakantie_verblijven(id,eigenaar,titel,plaats,land,beschrijving,adres,regels,prijs,schoonmaak,personen,van,tot,voorzieningen,open)
 values(p_id,ik,trim(d->>'titel'),trim(d->>'plaats'),trim(d->>'land'),trim(d->>'beschrijving'),trim(d->>'adres'),trim(d->>'regels'),
 (d->>'prijs')::integer,(d->>'schoonmaak')::integer,(d->>'personen')::integer,(d->>'van')::date,(d->>'tot')::date,voorzieningen,(d->>'open')::boolean)
 on conflict(id) do update set versie=private.vakantie_verblijven.versie+1,titel=excluded.titel,plaats=excluded.plaats,land=excluded.land,
 beschrijving=excluded.beschrijving,adres=excluded.adres,regels=excluded.regels,prijs=excluded.prijs,schoonmaak=excluded.schoonmaak,
 personen=excluded.personen,van=excluded.van,tot=excluded.tot,voorzieningen=excluded.voorzieningen,open=excluded.open returning * into v;
 return jsonb_build_object('verblijf',private.vakantie_json(v,true));
exception when invalid_datetime_format or datetime_field_overflow or check_violation or numeric_value_out_of_range then
 return jsonb_build_object('fout','Controleer datums, prijzen en capaciteit.');
end; $$;

create or replace function public.vakantie_aanvragen(p_naam text,p_wachtwoord text,p_id uuid,p_verblijf uuid,p_versie integer,p_van date,p_tot date,p_personen integer)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare ik bigint:=private.gebruiker_id(p_naam,p_wachtwoord); v private.vakantie_verblijven; oud private.vakantie_reserveringen; bedrag integer;
begin
 if ik is null then return jsonb_build_object('geen_toegang',true); end if;
 if p_id is null or p_verblijf is null or p_versie is null or p_van is null or p_tot is null or p_personen is null then return jsonb_build_object('fout','Controleer de aanvraag.'); end if;
 -- Gastlock voorkomt limiet- en idempotentiesleutelraces, verblijfslot voorkomt dubbele bevestiging.
 perform 1 from private.gebruikers where id=ik for update;
 select * into oud from private.vakantie_reserveringen where id=p_id;
 if found then
  if oud.gast=ik and oud.verblijf=p_verblijf and oud.versie=p_versie and oud.van=p_van and oud.tot=p_tot and oud.personen=p_personen then
   return jsonb_build_object('id',oud.id,'status',oud.status,'totaal',oud.totaal);
  end if;
  return jsonb_build_object('fout','Deze opdracht hoort bij een andere aanvraag.');
 end if;
 select * into v from private.vakantie_verblijven where id=p_verblijf for update;
 if not found or v.eigenaar=ik or not v.open or v.weg or v.versie<>p_versie or not exists(select 1 from private.gebruikers where id=v.eigenaar and not geblokkeerd and not verwijderd) then return jsonb_build_object('fout','Het aanbod is gewijzigd of niet beschikbaar. Zoek opnieuw.'); end if;
 if p_van<(now() at time zone 'Europe/Amsterdam')::date or p_tot<=p_van or p_tot>p_van+90 or p_van<v.van or p_tot>v.tot or p_personen not between 1 and v.personen then return jsonb_build_object('fout','Deze datums of dit aantal gasten passen niet.'); end if;
 if exists(select 1 from private.vakantie_blokkades where verblijf=v.id and van<p_tot and tot>p_van) then return jsonb_build_object('fout','Deze nachten zijn door de verhuurder geblokkeerd.'); end if;
 if exists(select 1 from private.vakantie_reserveringen where verblijf=v.id and status='bevestigd' and van<p_tot and tot>p_van) then return jsonb_build_object('fout','Deze nachten zijn inmiddels gereserveerd.'); end if;
 if exists(select 1 from private.vakantie_reserveringen where verblijf=v.id and gast=ik and status in ('aangevraagd','bevestigd') and van<p_tot and tot>p_van) then return jsonb_build_object('fout','Je hebt al een overlappende aanvraag voor dit verblijf. Bekijk je reserveringen.'); end if;
 if (select count(*) from private.vakantie_reserveringen where gast=ik and aangemaakt>now()-interval '24 hours')>=30 then return jsonb_build_object('fout','Je kunt maximaal dertig aanvragen per 24 uur doen.'); end if;
 if (select count(*) from private.vakantie_reserveringen where gast=ik and status='aangevraagd')>=20 then return jsonb_build_object('fout','Je hebt al twintig open aanvragen.'); end if;
 bedrag:=(p_tot-p_van)*v.prijs+v.schoonmaak;
 insert into private.vakantie_reserveringen(id,verblijf,gast,versie,van,tot,personen,totaal,voorwaarden)
 values(p_id,v.id,ik,v.versie,p_van,p_tot,p_personen,bedrag,v.regels);
 return jsonb_build_object('id',p_id,'status','aangevraagd','totaal',bedrag);
end; $$;

create or replace function public.vakantie_reservering_actie(p_naam text,p_wachtwoord text,p_id uuid,p_actie text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare ik bigint:=private.gebruiker_id(p_naam,p_wachtwoord); r private.vakantie_reserveringen; v private.vakantie_verblijven; doel text;
begin
 if ik is null then return jsonb_build_object('geen_toegang',true); end if;
 select * into r from private.vakantie_reserveringen where id=p_id;
 if not found then return jsonb_build_object('fout','Reservering niet beschikbaar.'); end if;
 select * into v from private.vakantie_verblijven where id=r.verblijf for update;
 select * into r from private.vakantie_reserveringen where id=p_id for update;
 if ik<>r.gast and ik<>v.eigenaar then return jsonb_build_object('fout','Reservering niet beschikbaar.'); end if;
 if p_actie='bevestigen' and ik=v.eigenaar then doel:='bevestigd';
 elsif p_actie='afwijzen' and ik=v.eigenaar then doel:='afgewezen';
 elsif p_actie='annuleren' then doel:='geannuleerd';
 else return jsonb_build_object('fout','Deze actie is niet toegestaan.'); end if;
 if r.status=doel then return jsonb_build_object('ok',true,'status',doel); end if;
 if r.status in ('afgewezen','geannuleerd') or (doel='afgewezen' and r.status<>'aangevraagd') then return jsonb_build_object('fout','Deze reservering is al afgehandeld.'); end if;
 if doel='bevestigd' then
  if r.versie<>v.versie or not v.open or v.weg or r.van<(now() at time zone 'Europe/Amsterdam')::date
   or not exists(select 1 from private.gebruikers where id=r.gast and not geblokkeerd and not verwijderd)
   then return jsonb_build_object('fout','Aanbod of aanvraag is gewijzigd. Wijs de oude aanvraag af of laat de gast die annuleren en opnieuw aanvragen.'); end if;
  if exists(select 1 from private.vakantie_blokkades where verblijf=v.id and van<r.tot and tot>r.van) then return jsonb_build_object('fout','Deze nachten zijn door de verhuurder geblokkeerd.'); end if;
  if exists(select 1 from private.vakantie_reserveringen where verblijf=v.id and id<>r.id and status='bevestigd' and van<r.tot and tot>r.van) then return jsonb_build_object('fout','Er is al een bevestigde reservering voor deze nachten.'); end if;
 end if;
 update private.vakantie_reserveringen set status=doel,adres=case when doel='bevestigd' then v.adres else null end where id=r.id;
 return jsonb_build_object('ok',true,'status',doel);
end; $$;

create or replace function public.vakantie_verblijf_verwijderen(p_naam text,p_wachtwoord text,p_id uuid,p_versie integer)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare ik bigint:=private.gebruiker_id(p_naam,p_wachtwoord); v private.vakantie_verblijven;
begin
 if ik is null then return jsonb_build_object('geen_toegang',true); end if;
 select * into v from private.vakantie_verblijven where id=p_id for update;
 if not found or v.eigenaar<>ik then return jsonb_build_object('fout','Verblijf niet beschikbaar.'); end if;
 if v.weg then return jsonb_build_object('ok',true); end if;
 if p_versie is distinct from v.versie then return jsonb_build_object('fout','Het aanbod is gewijzigd. Vernieuw eerst.'); end if;
 if exists(select 1 from private.vakantie_reserveringen where verblijf=p_id and status='bevestigd' and tot>=(now() at time zone 'Europe/Amsterdam')::date) then return jsonb_build_object('fout','Handel toekomstige bevestigde reserveringen eerst af.'); end if;
 update private.vakantie_verblijven set open=false,weg=true,versie=versie+1,adres='' where id=p_id;
 update private.vakantie_reserveringen set status='afgewezen' where verblijf=p_id and status='aangevraagd';
 return jsonb_build_object('ok',true);
end; $$;
revoke all on function public.vakantie_verblijven_zoeken(text,text,date,date,integer,text),public.mijn_vakantie_verhuur(text,text),
 public.vakantie_verblijf_bewaren(text,text,uuid,integer,jsonb),public.vakantie_aanvragen(text,text,uuid,uuid,integer,date,date,integer),
 public.vakantie_reservering_actie(text,text,uuid,text),public.vakantie_verblijf_verwijderen(text,text,uuid,integer) from public;
grant execute on function public.vakantie_verblijven_zoeken(text,text,date,date,integer,text),public.mijn_vakantie_verhuur(text,text),
 public.vakantie_verblijf_bewaren(text,text,uuid,integer,jsonb),public.vakantie_aanvragen(text,text,uuid,uuid,integer,date,date,integer),
 public.vakantie_reservering_actie(text,text,uuid,text),public.vakantie_verblijf_verwijderen(text,text,uuid,integer) to anon,authenticated;
create or replace function public.vakantie_blokkade_bewaren(p_naam text,p_wachtwoord text,p_id uuid,p_verblijf uuid,p_van date,p_tot date,p_verwijderen boolean default false)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare ik bigint:=private.gebruiker_id(p_naam,p_wachtwoord); v private.vakantie_verblijven; b private.vakantie_blokkades;
begin
 if ik is null then return jsonb_build_object('geen_toegang',true); end if;
 select * into v from private.vakantie_verblijven where id=p_verblijf for update;
 if not found or v.eigenaar<>ik or v.weg or p_id is null then return jsonb_build_object('fout','Verblijf niet beschikbaar.'); end if;
 select * into b from private.vakantie_blokkades where id=p_id;
 if b.id is not null and b.verblijf<>v.id then return jsonb_build_object('fout','Deze opdracht hoort bij een ander verblijf.'); end if;
 if p_verwijderen is true then
  delete from private.vakantie_blokkades where id=p_id and verblijf=v.id;
  return jsonb_build_object('ok',true);
 end if;
 if b.id is not null then
  if b.van=p_van and b.tot=p_tot then return jsonb_build_object('ok',true); end if;
  return jsonb_build_object('fout','Deze blokkade heeft andere datums. Vernieuw eerst.');
 end if;
 if p_van is null or p_tot is null or p_tot<=p_van or p_tot>p_van+730 then return jsonb_build_object('fout','Controleer de geblokkeerde datums.'); end if;
 if (select count(*) from private.vakantie_blokkades where verblijf=v.id)>=100 then return jsonb_build_object('fout','Maximaal honderd blokkades per verblijf.'); end if;
 if exists(select 1 from private.vakantie_reserveringen where verblijf=v.id and status='bevestigd' and van<p_tot and tot>p_van) then return jsonb_build_object('fout','Er staat al een bevestigde reservering. Handel die eerst af.'); end if;
 insert into private.vakantie_blokkades values(p_id,v.id,p_van,p_tot);
 return jsonb_build_object('ok',true);
end; $$;
revoke all on function public.vakantie_blokkade_bewaren(text,text,uuid,uuid,date,date,boolean) from public;
grant execute on function public.vakantie_blokkade_bewaren(text,text,uuid,uuid,date,date,boolean) to anon,authenticated;

-- Een verwijderd account blijft nooit als verhuurder zichtbaar en houdt geen exact huisadres vast.
create or replace function private.vakantie_account_opruimen()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
 if new.verwijderd and not coalesce(old.verwijderd,false) then
  update private.vakantie_verblijven set open=false,weg=true,versie=versie+1,adres='',beschrijving='',regels='Account verwijderd.' where eigenaar=new.id;
  update private.vakantie_reserveringen set status='geannuleerd',adres=null,voorwaarden='Account verwijderd.'
   where gast=new.id or verblijf in (select id from private.vakantie_verblijven where eigenaar=new.id);
 end if;
 return new;
end; $$;
revoke all on function private.vakantie_account_opruimen() from public,anon,authenticated;
drop trigger if exists vakantie_account_verwijderen on private.gebruikers;
create trigger vakantie_account_verwijderen after update of verwijderd on private.gebruikers for each row execute function private.vakantie_account_opruimen();
notify pgrst,'reload schema';
commit;
