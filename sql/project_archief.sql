-- Onafhankelijk, append-only archief van versleutelde projectsnapshots.
-- Vereist chat.sql en chat_community.sql. Geen automatische uitrol.
begin;
create table if not exists private.project_archief (
  id bigint generated always as identity primary key,
  gesprek bigint not null references private.chat_gesprekken(id) on delete cascade,
  bestand uuid not null,
  opdracht uuid not null,
  afzender bigint not null references private.gebruikers(id) on delete cascade,
  apparaat bigint not null references private.chat_apparaten(id) on delete cascade,
  inhoud text not null, iv text not null, epk jsonb not null,
  sleutels jsonb not null, handtekening text not null,
  aangemaakt timestamptz not null default now(),
  unique (gesprek, opdracht)
);
create index if not exists project_archief_bestand on private.project_archief (gesprek, bestand, id desc);
alter table private.project_archief enable row level security;
revoke all on private.project_archief from public, anon, authenticated;

create or replace function private.project_toegang(p_naam text, p_wachtwoord text, p_gesprek bigint, p_schrijven boolean)
returns bigint language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); g private.chat_gesprekken;
begin
  if v_id is null then return null; end if;
  select * into g from private.chat_gesprekken where id = p_gesprek and not weg;
  if not found or private.chat_lid(v_id, p_gesprek) is distinct from 'lid' then return null; end if;
  if p_schrijven and g.alleen_beheer and not private.chat_mag_beheren(v_id, p_gesprek) then return null; end if;
  if g.soort = 'twee' and exists (select 1 from private.chat_leden l where l.gesprek = g.id and l.gebruiker <> v_id
    and (l.status = 'weg' or private.chat_geblokkeerd(v_id, l.gebruiker))) then return null; end if;
  return v_id;
end; $$;
revoke all on function private.project_toegang(text,text,bigint,boolean) from public;

create or replace function public.project_archief_bewaren(p_naam text, p_wachtwoord text, p_gesprek bigint,
  p_bestand uuid, p_opdracht uuid, p_apparaat bigint, p_inhoud text, p_iv text, p_epk jsonb, p_sleutels jsonb, p_handtekening text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.project_toegang(p_naam,p_wachtwoord,p_gesprek,true); oud private.project_archief; v_nieuw bigint;
begin
  if v_id is null then return jsonb_build_object('fout','Geen toegang tot projectarchivering.'); end if;
  if p_bestand is null or p_opdracht is null or p_inhoud is null or length(p_inhoud) not between 1 and 500000
    or p_iv is null or length(p_iv) not between 1 and 100 or p_epk is null or jsonb_typeof(p_epk) <> 'object'
    or p_sleutels is null or jsonb_typeof(p_sleutels) <> 'object' or length(p_sleutels::text) > 200000
    or p_handtekening is null or length(p_handtekening) not between 1 and 500
    or not exists (select 1 from private.chat_apparaten where id = p_apparaat and gebruiker = v_id and not weg)
  then return jsonb_build_object('fout','Ongeldige archiefinhoud of apparaat.'); end if;
  perform pg_advisory_xact_lock(p_gesprek);
  select * into oud from private.project_archief where gesprek=p_gesprek and opdracht=p_opdracht;
  if found then
    if oud.afzender=v_id and oud.bestand=p_bestand and oud.apparaat=p_apparaat and oud.inhoud=p_inhoud
      and oud.iv=p_iv and oud.epk=p_epk and oud.sleutels=p_sleutels and oud.handtekening=p_handtekening
    then return jsonb_build_object('id',oud.id,'aangemaakt',oud.aangemaakt); end if;
    return jsonb_build_object('fout','Deze archiefopdracht heeft een andere inhoud.');
  end if;
  if (select count(*) from private.project_archief where gesprek=p_gesprek and bestand=p_bestand) >= 200
    then return jsonb_build_object('fout','Maximum van 200 archiefversies per bestand bereikt.'); end if;
  if not exists(select 1 from private.project_archief where gesprek=p_gesprek and bestand=p_bestand)
    and (select count(distinct bestand) from private.project_archief where gesprek=p_gesprek) >= 50
    then return jsonb_build_object('fout','Maximum van 50 gearchiveerde bestanden per project bereikt.'); end if;
  insert into private.project_archief(gesprek,bestand,opdracht,afzender,apparaat,inhoud,iv,epk,sleutels,handtekening)
    values(p_gesprek,p_bestand,p_opdracht,v_id,p_apparaat,p_inhoud,p_iv,p_epk,p_sleutels,p_handtekening) returning id into v_nieuw;
  return jsonb_build_object('id',v_nieuw,'aangemaakt',(select aangemaakt from private.project_archief where id=v_nieuw));
end; $$;

create or replace function public.project_archief_bestanden(p_naam text,p_wachtwoord text,p_gesprek bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  if private.project_toegang(p_naam,p_wachtwoord,p_gesprek,false) is null then return jsonb_build_object('fout','Geen toegang.'); end if;
  return jsonb_build_object('bestanden',coalesce((select jsonb_agg(to_jsonb(s) order by s.laatst desc) from (
    select bestand,max(aangemaakt) laatst,count(*) aantal from private.project_archief
    where gesprek=p_gesprek group by bestand order by max(aangemaakt) desc limit 50) s),'[]'::jsonb));
end; $$;

create or replace function public.project_archief_lijst(p_naam text,p_wachtwoord text,p_gesprek bigint,p_bestand uuid,p_voor bigint default null)
returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  if private.project_toegang(p_naam,p_wachtwoord,p_gesprek,false) is null then return jsonb_build_object('fout','Geen toegang.'); end if;
  return jsonb_build_object('versies',coalesce((select jsonb_agg(to_jsonb(s) order by s.id desc) from (
    select id,afzender,aangemaakt from private.project_archief where gesprek=p_gesprek and bestand=p_bestand
      and (p_voor is null or id < p_voor) order by id desc limit 20) s),'[]'::jsonb));
end; $$;

create or replace function public.project_archief_lezen(p_naam text,p_wachtwoord text,p_gesprek bigint,p_id bigint,p_apparaat bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.project_toegang(p_naam,p_wachtwoord,p_gesprek,false);
begin
  if v_id is null or not exists(select 1 from private.chat_apparaten where id=p_apparaat and gebruiker=v_id and not weg)
    then return jsonb_build_object('fout','Geen toegang.'); end if;
  return coalesce((select jsonb_build_object('bestand',a.bestand,'id',a.id,'afzender',a.afzender,'apparaat',a.apparaat,
    'aangemaakt',a.aangemaakt,'weg',false,'inhoud',a.inhoud,'iv',a.iv,'epk',a.epk,
    'sleutel',a.sleutels->p_apparaat::text,'handtekening',a.handtekening,'teken',d.teken)
    from private.project_archief a join private.chat_apparaten d on d.id=a.apparaat
    where a.id=p_id and a.gesprek=p_gesprek),jsonb_build_object('fout','Archiefversie niet gevonden.'));
end; $$;
revoke all on function public.project_archief_bewaren(text,text,bigint,uuid,uuid,bigint,text,text,jsonb,jsonb,text),
  public.project_archief_lijst(text,text,bigint,uuid,bigint),public.project_archief_lezen(text,text,bigint,bigint,bigint),public.project_archief_bestanden(text,text,bigint) from public;
grant execute on function public.project_archief_bewaren(text,text,bigint,uuid,uuid,bigint,text,text,jsonb,jsonb,text),
  public.project_archief_lijst(text,text,bigint,uuid,bigint),public.project_archief_lezen(text,text,bigint,bigint,bigint),public.project_archief_bestanden(text,text,bigint) to anon, authenticated;
notify pgrst,'reload schema';
commit;
