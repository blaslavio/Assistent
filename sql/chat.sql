-- Chat met end-to-end-versleuteling. De database bewaart alleen versleutelde berichten: versleutelen en
-- ontsleutelen gebeurt in de browser (chat.py), met sleutels die het apparaat nooit verlaten. Wie met wie praat
-- en wanneer (metadata) is voor de server wel zichtbaar.

create table if not exists private.chat_apparaten (
  id bigint generated always as identity primary key,
  gebruiker bigint not null references private.gebruikers(id),
  naam text not null default '',
  ecdh jsonb not null,
  teken jsonb not null,
  vingerafdruk text not null,
  aangemaakt timestamptz not null default now(),
  laatst timestamptz not null default now(),
  weg boolean not null default false
);
create index if not exists chat_apparaten_gebruiker on private.chat_apparaten (gebruiker);

create table if not exists private.chat_gesprekken (
  id bigint generated always as identity primary key,
  soort text not null check (soort in ('twee', 'groep')),
  naam text not null default '',
  maker bigint not null references private.gebruikers(id),
  verdwijnen integer check (verdwijnen is null or verdwijnen between 300 and 7776000),
  aangemaakt timestamptz not null default now(),
  laatst timestamptz not null default now()
);
create table if not exists private.chat_leden (
  gesprek bigint not null references private.chat_gesprekken(id),
  gebruiker bigint not null references private.gebruikers(id),
  status text not null default 'verzoek' check (status in ('lid', 'verzoek', 'weg')),
  beheerder boolean not null default false,
  gelezen_tot bigint not null default 0,
  stil boolean not null default false,
  gewijzigd timestamptz not null default now(),
  primary key (gesprek, gebruiker)
);
create index if not exists chat_leden_gebruiker on private.chat_leden (gebruiker);
create table if not exists private.chat_blokkades (
  gebruiker bigint not null references private.gebruikers(id),
  geblokkeerd bigint not null references private.gebruikers(id),
  aangemaakt timestamptz not null default now(),
  weg boolean not null default false,
  primary key (gebruiker, geblokkeerd)
);
create table if not exists private.chat_berichten (
  id bigint generated always as identity primary key,
  gesprek bigint not null references private.chat_gesprekken(id),
  afzender bigint not null references private.gebruikers(id),
  apparaat bigint not null references private.chat_apparaten(id),
  inhoud text not null,
  iv text not null,
  epk jsonb not null,
  sleutels jsonb not null,
  handtekening text not null,
  aangemaakt timestamptz not null default now(),
  verloopt timestamptz,
  weg boolean not null default false
);
create index if not exists chat_berichten_gesprek on private.chat_berichten (gesprek, id);
create index if not exists chat_berichten_verloopt on private.chat_berichten (verloopt) where not weg;

alter table private.chat_apparaten enable row level security;
alter table private.chat_gesprekken enable row level security;
alter table private.chat_leden enable row level security;
alter table private.chat_blokkades enable row level security;
alter table private.chat_berichten enable row level security;

create or replace function private.chat_lid(p_gebruiker bigint, p_gesprek bigint)
returns text language sql stable security definer set search_path to '' as $$
  select status from private.chat_leden where gesprek = p_gesprek and gebruiker = p_gebruiker
$$;

create or replace function private.chat_geblokkeerd(p_a bigint, p_b bigint)
returns boolean language sql stable security definer set search_path to '' as $$
  select exists (select 1 from private.chat_blokkades where not weg
                 and ((gebruiker = p_a and geblokkeerd = p_b) or (gebruiker = p_b and geblokkeerd = p_a)))
$$;

create or replace function private.chat_heeft_apparaat(p_gebruiker bigint)
returns boolean language sql stable security definer set search_path to '' as $$
  select exists (select 1 from private.chat_apparaten where gebruiker = p_gebruiker and not weg)
$$;

create or replace function private.chat_gesprek_json(g private.chat_gesprekken, p_ik bigint)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('id', g.id, 'soort', g.soort, 'naam', g.naam, 'verdwijnen', g.verdwijnen,
    'laatst', g.laatst, 'status', l.status, 'beheerder', l.beheerder, 'stil', l.stil,
    'ongelezen', (select count(*) from private.chat_berichten b where b.gesprek = g.id and b.id > l.gelezen_tot
                  and b.afzender <> p_ik and not b.weg),
    'leden', coalesce((select jsonb_agg(jsonb_build_object('id', x.gebruiker, 'naam', private.weergave(x.gebruiker),
        'gebruikersnaam', u.naam, 'status', x.status, 'beheerder', x.beheerder, 'gelezen_tot', x.gelezen_tot)
        order by x.gebruiker)
      from private.chat_leden x join private.gebruikers u on u.id = x.gebruiker
      where x.gesprek = g.id and x.status <> 'weg'), '[]'::jsonb))
  from private.chat_leden l where l.gesprek = g.id and l.gebruiker = p_ik
$$;

-- Een apparaat meldt zijn openbare sleutels aan (de geheime sleutels blijven op het apparaat).
create or replace function public.chat_apparaat_aanmelden(p_naam text, p_wachtwoord text, p_apparaat text,
                                                         p_ecdh jsonb, p_teken jsonb, p_vingerafdruk text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_nieuw bigint;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if coalesce(p_ecdh ->> 'kty', '') <> 'EC' or coalesce(p_teken ->> 'kty', '') <> 'EC' or p_ecdh ? 'd' or p_teken ? 'd'
     or coalesce(p_vingerafdruk, '') !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('fout', 'Ongeldige sleutel.');
  end if;
  if (select count(*) from private.chat_apparaten where gebruiker = v_id and not weg) >= 10 then
    return jsonb_build_object('fout', 'Je hebt al 10 apparaten voor de chat. Haal er eerst een weg.');
  end if;
  insert into private.chat_apparaten (gebruiker, naam, ecdh, teken, vingerafdruk)
  values (v_id, left(coalesce(p_apparaat, ''), 60),
          jsonb_build_object('kty', 'EC', 'crv', p_ecdh ->> 'crv', 'x', p_ecdh ->> 'x', 'y', p_ecdh ->> 'y'),
          jsonb_build_object('kty', 'EC', 'crv', p_teken ->> 'crv', 'x', p_teken ->> 'x', 'y', p_teken ->> 'y'),
          p_vingerafdruk)
  returning id into v_nieuw;
  return jsonb_build_object('ok', true, 'id', v_nieuw, 'gebruiker', v_id, 'naam', private.weergave(v_id));
end; $$;

create or replace function public.chat_ik(p_naam text, p_wachtwoord text, p_apparaat bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  update private.chat_apparaten set laatst = now() where id = p_apparaat and gebruiker = v_id and not weg;
  return jsonb_build_object('gebruiker', v_id, 'naam', private.weergave(v_id), 'apparaat_geldig', found,
    'apparaten', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'naam', a.naam, 'aangemaakt', a.aangemaakt,
      'laatst', a.laatst, 'vingerafdruk', a.vingerafdruk) order by a.id)
      from private.chat_apparaten a where a.gebruiker = v_id and not a.weg), '[]'::jsonb));
end; $$;

create or replace function public.chat_apparaat_weg(p_naam text, p_wachtwoord text, p_apparaat bigint)
returns boolean language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return false; end if;
  update private.chat_apparaten set weg = true where id = p_apparaat and gebruiker = v_id;
  return found;
end; $$;

create or replace function public.chat_gesprekken(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object('gesprekken', coalesce((select jsonb_agg(private.chat_gesprek_json(g, v_id) order by g.laatst desc)
    from private.chat_gesprekken g join private.chat_leden l on l.gesprek = g.id
    where l.gebruiker = v_id and l.status in ('lid', 'verzoek')), '[]'::jsonb));
end; $$;

-- Een gesprek met één persoon (bestaat het al, dan dat). De ander krijgt het eerst als verzoek.
create or replace function public.chat_starten(p_naam text, p_wachtwoord text, p_met text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_ander bigint; v_gesprek bigint;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select id into v_ander from private.gebruikers
  where naam = lower(trim(coalesce(p_met, ''))) and not verwijderd and not geblokkeerd;
  if v_ander is null then return jsonb_build_object('fout', 'Geen gebruiker met die naam.'); end if;
  if v_ander = v_id then return jsonb_build_object('fout', 'Dat ben je zelf.'); end if;
  if private.chat_geblokkeerd(v_id, v_ander) then return jsonb_build_object('fout', 'Chatten met deze persoon kan niet.'); end if;
  if not private.chat_heeft_apparaat(v_ander) then
    return jsonb_build_object('fout', 'Deze persoon gebruikt de chat nog niet. Vraag of die de chat één keer opent.');
  end if;
  select g.id into v_gesprek from private.chat_gesprekken g
  where g.soort = 'twee' and exists (select 1 from private.chat_leden where gesprek = g.id and gebruiker = v_id)
    and exists (select 1 from private.chat_leden where gesprek = g.id and gebruiker = v_ander) limit 1;
  if v_gesprek is null then
    if (select count(*) from private.chat_gesprekken where maker = v_id and aangemaakt > now() - interval '1 day') >= 50 then
      return jsonb_build_object('fout', 'Je hebt vandaag al veel nieuwe gesprekken gestart.');
    end if;
    insert into private.chat_gesprekken (soort, maker) values ('twee', v_id) returning id into v_gesprek;
    insert into private.chat_leden (gesprek, gebruiker, status) values (v_gesprek, v_id, 'lid'), (v_gesprek, v_ander, 'verzoek');
  else
    update private.chat_leden set status = 'lid', gewijzigd = now() where gesprek = v_gesprek and gebruiker = v_id;
    update private.chat_leden set status = 'verzoek', gewijzigd = now()
    where gesprek = v_gesprek and gebruiker = v_ander and status = 'weg';
  end if;
  return jsonb_build_object('ok', true, 'id', v_gesprek);
end; $$;

create or replace function public.chat_groep_maken(p_naam text, p_wachtwoord text, p_groep text, p_leden text[])
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_gesprek bigint; v_niet text[] := '{}';
  v_lid text; v_ander bigint;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if trim(coalesce(p_groep, '')) = '' then return jsonb_build_object('fout', 'Geef de groep een naam.'); end if;
  if coalesce(array_length(p_leden, 1), 0) > 100 then return jsonb_build_object('fout', 'Hoogstens 100 mensen.'); end if;
  insert into private.chat_gesprekken (soort, naam, maker) values ('groep', left(trim(p_groep), 60), v_id)
  returning id into v_gesprek;
  insert into private.chat_leden (gesprek, gebruiker, status, beheerder) values (v_gesprek, v_id, 'lid', true);
  foreach v_lid in array coalesce(p_leden, '{}') loop
    select id into v_ander from private.gebruikers
    where naam = lower(trim(v_lid)) and not verwijderd and not geblokkeerd and id <> v_id;
    if v_ander is null or private.chat_geblokkeerd(v_id, v_ander) or not private.chat_heeft_apparaat(v_ander) then
      v_niet := v_niet || v_lid;
    else
      insert into private.chat_leden (gesprek, gebruiker, status) values (v_gesprek, v_ander, 'verzoek')
      on conflict do nothing;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'id', v_gesprek, 'niet_gevonden', to_jsonb(v_niet));
end; $$;

create or replace function public.chat_lid_toevoegen(p_naam text, p_wachtwoord text, p_gesprek bigint, p_wie text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_ander bigint;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if not exists (select 1 from private.chat_leden l join private.chat_gesprekken g on g.id = l.gesprek
                 where l.gesprek = p_gesprek and l.gebruiker = v_id and l.status = 'lid' and l.beheerder and g.soort = 'groep') then
    return jsonb_build_object('fout', 'Alleen een beheerder van de groep kan mensen toevoegen.');
  end if;
  select id into v_ander from private.gebruikers where naam = lower(trim(coalesce(p_wie, ''))) and not verwijderd and not geblokkeerd;
  if v_ander is null then return jsonb_build_object('fout', 'Geen gebruiker met die naam.'); end if;
  if private.chat_geblokkeerd(v_id, v_ander) then return jsonb_build_object('fout', 'Dat kan niet.'); end if;
  if not private.chat_heeft_apparaat(v_ander) then
    return jsonb_build_object('fout', 'Deze persoon gebruikt de chat nog niet. Vraag of die de chat één keer opent.');
  end if;
  if (select count(*) from private.chat_leden where gesprek = p_gesprek and status <> 'weg') >= 100 then
    return jsonb_build_object('fout', 'Een groep heeft hoogstens 100 mensen.');
  end if;
  insert into private.chat_leden (gesprek, gebruiker, status) values (p_gesprek, v_ander, 'verzoek')
  on conflict (gesprek, gebruiker) do update set status = case when private.chat_leden.status = 'lid' then 'lid' else 'verzoek' end,
    gewijzigd = now();
  return jsonb_build_object('ok', true);
end; $$;

-- Verzoek aannemen (ja), afslaan (nee) of later het gesprek verlaten (verlaten).
create or replace function public.chat_antwoorden(p_naam text, p_wachtwoord text, p_gesprek bigint, p_antwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  update private.chat_leden set status = case when p_antwoord = 'ja' then 'lid' else 'weg' end, gewijzigd = now(),
    beheerder = beheerder and p_antwoord = 'ja'
  where gesprek = p_gesprek and gebruiker = v_id and p_antwoord in ('ja', 'nee', 'verlaten')
    and case p_antwoord when 'verlaten' then status = 'lid' else status = 'verzoek' end;
  if not found then return jsonb_build_object('fout', 'Dit kan niet (meer).'); end if;
  if p_antwoord = 'verlaten' and not exists (select 1 from private.chat_leden where gesprek = p_gesprek and status = 'lid' and beheerder) then
    update private.chat_leden set beheerder = true
    where gesprek = p_gesprek and gebruiker = (select gebruiker from private.chat_leden where gesprek = p_gesprek
                                               and status = 'lid' order by gewijzigd limit 1);
  end if;
  return jsonb_build_object('ok', true);
end; $$;

create or replace function public.chat_blokkeren(p_naam text, p_wachtwoord text, p_wie bigint, p_aan boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if p_wie = v_id then return jsonb_build_object('fout', 'Dat ben je zelf.'); end if;
  insert into private.chat_blokkades (gebruiker, geblokkeerd, weg) values (v_id, p_wie, not p_aan)
  on conflict (gebruiker, geblokkeerd) do update set weg = not p_aan, aangemaakt = now();
  if p_aan then
    update private.chat_leden l set status = 'weg', gewijzigd = now()
    from private.chat_gesprekken g
    where g.id = l.gesprek and g.soort = 'twee' and l.gebruiker = v_id and l.status <> 'weg'
      and exists (select 1 from private.chat_leden x where x.gesprek = g.id and x.gebruiker = p_wie);
  end if;
  return jsonb_build_object('ok', true);
end; $$;

-- De openbare sleutels van alle apparaten van iedereen in het gesprek (om voor te versleutelen).
create or replace function public.chat_sleutels(p_naam text, p_wachtwoord text, p_gesprek bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if private.chat_lid(v_id, p_gesprek) is distinct from 'lid' then return jsonb_build_object('fout', 'Geen toegang.'); end if;
  return jsonb_build_object('apparaten', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'gebruiker', a.gebruiker,
      'ecdh', a.ecdh, 'teken', a.teken, 'vingerafdruk', a.vingerafdruk) order by a.id)
    from private.chat_apparaten a join private.chat_leden l on l.gebruiker = a.gebruiker
    where l.gesprek = p_gesprek and l.status in ('lid', 'verzoek') and not a.weg), '[]'::jsonb));
end; $$;

create or replace function public.chat_versturen(p_naam text, p_wachtwoord text, p_gesprek bigint, p_apparaat bigint,
                                                 p_inhoud text, p_iv text, p_epk jsonb, p_sleutels jsonb,
                                                 p_handtekening text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); g private.chat_gesprekken; v_nieuw bigint;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into g from private.chat_gesprekken where id = p_gesprek;
  if private.chat_lid(v_id, p_gesprek) is distinct from 'lid' then return jsonb_build_object('fout', 'Geen toegang.'); end if;
  if g.soort = 'twee' and exists (select 1 from private.chat_leden l where l.gesprek = g.id and l.gebruiker <> v_id
                                  and (l.status = 'weg' or private.chat_geblokkeerd(v_id, l.gebruiker))) then
    return jsonb_build_object('fout', 'Deze persoon kan je geen berichten meer sturen of ontvangen.');
  end if;
  if not exists (select 1 from private.chat_apparaten where id = p_apparaat and gebruiker = v_id and not weg) then
    return jsonb_build_object('fout', 'Dit apparaat is niet (meer) aangemeld voor de chat.');
  end if;
  if length(coalesce(p_inhoud, '')) > 2000000 or jsonb_typeof(p_sleutels) <> 'object' or length(p_sleutels::text) > 200000 then
    return jsonb_build_object('fout', 'Dit bericht is te groot.');
  end if;
  if (select count(*) from private.chat_berichten where afzender = v_id and aangemaakt > now() - interval '1 hour') >= 600 then
    return jsonb_build_object('fout', 'Je stuurt erg veel berichten. Wacht even.');
  end if;
  insert into private.chat_berichten (gesprek, afzender, apparaat, inhoud, iv, epk, sleutels, handtekening, verloopt)
  values (p_gesprek, v_id, p_apparaat, p_inhoud, left(p_iv, 64), p_epk, p_sleutels, left(p_handtekening, 400),
          case when g.verdwijnen is null then null else now() + make_interval(secs => g.verdwijnen) end)
  returning id into v_nieuw;
  update private.chat_gesprekken set laatst = now() where id = p_gesprek;
  update private.chat_leden set gelezen_tot = v_nieuw where gesprek = p_gesprek and gebruiker = v_id;
  perform private.push_inplannen(l.gebruiker, now(), 'bericht', 'chat:' || p_gesprek,
    case when g.soort = 'groep' then g.naam else private.weergave(v_id) end,
    case when g.soort = 'groep' then private.weergave(v_id) || ': nieuw bericht' else 'Nieuw bericht' end,
    coalesce((select rtrim(p.app_adres, '/') || '/chat?gesprek=' || p_gesprek from private.platform p
              where p.app_adres <> '' limit 1), ''))
  from private.chat_leden l where l.gesprek = p_gesprek and l.gebruiker <> v_id and l.status in ('lid', 'verzoek') and not l.stil;
  return jsonb_build_object('ok', true, 'id', v_nieuw);
end; $$;

-- Berichten na een bepaald nummer, met alleen de sleutel voor dit apparaat.
create or replace function public.chat_berichten(p_naam text, p_wachtwoord text, p_gesprek bigint, p_na bigint,
                                                 p_apparaat bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if private.chat_lid(v_id, p_gesprek) not in ('lid', 'verzoek') or private.chat_lid(v_id, p_gesprek) is null then
    return jsonb_build_object('fout', 'Geen toegang.');
  end if;
  return jsonb_build_object('berichten', coalesce((select jsonb_agg(x order by (x ->> 'id')::bigint) from (
    select jsonb_build_object('id', b.id, 'afzender', b.afzender, 'apparaat', b.apparaat, 'aangemaakt', b.aangemaakt,
      'verloopt', b.verloopt, 'weg', b.weg,
      'inhoud', case when b.weg then null else b.inhoud end, 'iv', b.iv, 'epk', b.epk,
      'sleutel', case when b.weg then null else b.sleutels -> p_apparaat::text end,
      'handtekening', b.handtekening, 'teken', a.teken, 'vingerafdruk', a.vingerafdruk) x
    from private.chat_berichten b join private.chat_apparaten a on a.id = b.apparaat
    join private.chat_apparaten mijn on mijn.id = p_apparaat and mijn.gebruiker = v_id
    where b.gesprek = p_gesprek and b.id > coalesce(p_na, 0)
      and (b.sleutels ? p_apparaat::text or (b.weg and b.aangemaakt >= mijn.aangemaakt))
    order by b.id limit 200) s), '[]'::jsonb),
    'gesprek', (select private.chat_gesprek_json(g, v_id) from private.chat_gesprekken g where g.id = p_gesprek));
end; $$;

create or replace function public.chat_gelezen(p_naam text, p_wachtwoord text, p_gesprek bigint, p_tot bigint)
returns boolean language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return false; end if;
  update private.chat_leden set gelezen_tot = greatest(gelezen_tot, least(coalesce(p_tot, 0),
    (select coalesce(max(id), 0) from private.chat_berichten where gesprek = p_gesprek)))
  where gesprek = p_gesprek and gebruiker = v_id and status = 'lid';
  return found;
end; $$;

-- Een eigen bericht voor iedereen weghalen.
create or replace function public.chat_bericht_weg(p_naam text, p_wachtwoord text, p_bericht bigint)
returns boolean language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return false; end if;
  update private.chat_berichten set weg = true, inhoud = '', sleutels = '{}'::jsonb where id = p_bericht and afzender = v_id;
  return found;
end; $$;

create or replace function public.chat_instellen(p_naam text, p_wachtwoord text, p_gesprek bigint, p_verdwijnen integer,
                                                 p_stil boolean, p_groepsnaam text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if private.chat_lid(v_id, p_gesprek) is distinct from 'lid' then return jsonb_build_object('fout', 'Geen toegang.'); end if;
  if p_verdwijnen is not null and p_verdwijnen not in (0, 3600, 86400, 604800, 7776000) then
    return jsonb_build_object('fout', 'Kies een van de vaste tijden.');
  end if;
  if p_verdwijnen is not null then
    update private.chat_gesprekken set verdwijnen = nullif(p_verdwijnen, 0) where id = p_gesprek;
  end if;
  if p_stil is not null then
    update private.chat_leden set stil = p_stil where gesprek = p_gesprek and gebruiker = v_id;
  end if;
  if trim(coalesce(p_groepsnaam, '')) <> '' then
    update private.chat_gesprekken set naam = left(trim(p_groepsnaam), 60) where id = p_gesprek and soort = 'groep';
  end if;
  return jsonb_build_object('ok', true);
end; $$;

-- Verdwijnende berichten echt leeg maken (elke tien minuten).
create or replace function private.chat_opruimen()
returns void language sql security definer set search_path to '' as $$
  update private.chat_berichten set weg = true, inhoud = '', sleutels = '{}'::jsonb
  where verloopt is not null and verloopt < now() and not weg
$$;

revoke all on function private.chat_lid(bigint, bigint) from public, anon, authenticated;
revoke all on function private.chat_geblokkeerd(bigint, bigint) from public, anon, authenticated;
revoke all on function private.chat_heeft_apparaat(bigint) from public, anon, authenticated;
revoke all on function private.chat_gesprek_json(private.chat_gesprekken, bigint) from public, anon, authenticated;
revoke all on function private.chat_opruimen() from public, anon, authenticated;

select cron.schedule('chat-opruimen', '*/10 * * * *', 'select private.chat_opruimen()');
