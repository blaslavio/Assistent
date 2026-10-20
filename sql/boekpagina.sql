-- Eigen boekingspagina (zoals Calendly). Je kiest wanneer je kunt; anderen kiezen via je link een vrij moment.
-- Ze zien alleen vrije tijden, nooit je afspraken. Een boeking komt (na je akkoord, als je dat wilt) in je agenda.

create table if not exists private.boekpaginas (
  gebruiker_id bigint primary key references private.gebruikers(id),
  adres text not null unique check (adres ~ '^[a-z0-9-]{3,40}$'),
  aan boolean not null default false,
  titel text not null default '',
  intro text not null default '',
  soorten jsonb not null default '[{"naam": "Kennismaking", "minuten": 30}]'::jsonb,
  uren jsonb not null default '{"1": [["09:00", "17:00"]], "2": [["09:00", "17:00"]], "3": [["09:00", "17:00"]],
                                "4": [["09:00", "17:00"]], "5": [["09:00", "17:00"]]}'::jsonb,
  buffer integer not null default 15 check (buffer between 0 and 120),
  min_vooraf integer not null default 12 check (min_vooraf between 0 and 336),
  vooruit integer not null default 30 check (vooruit between 1 and 90),
  max_per_dag integer not null default 4 check (max_per_dag between 1 and 20),
  bevestigen boolean not null default false,
  locatie text not null default '',
  aangemaakt timestamptz not null default now()
);
create table if not exists private.boekingen (
  id bigint generated always as identity primary key,
  gebruiker_id bigint not null references private.gebruikers(id),
  soort text not null,
  start timestamptz not null,
  minuten integer not null,
  naam text not null,
  email text not null default '',
  telefoon text not null default '',
  notitie text not null default '',
  status text not null default 'aangevraagd' check (status in ('aangevraagd', 'bevestigd', 'afgewezen', 'geannuleerd')),
  code_hash text not null unique,
  afspraak_id text,
  verwerkt boolean not null default false,
  aangemaakt timestamptz not null default now()
);
create index if not exists boekingen_gebruiker_start on private.boekingen (gebruiker_id, start);

alter table private.boekpaginas enable row level security;
alter table private.boekingen enable row level security;

-- Bezet in je agenda of door een andere boeking (met wat lucht ertussen)? Een hele dag telt alleen als bezet
-- als het een reis is (zoals in Google en Apple: hele dagen zijn standaard 'vrij').
create or replace function private.boek_bezet(p_gebruiker bigint, p_van timestamptz, p_tot timestamptz, p_buffer integer)
returns boolean language sql stable security definer set search_path to '' as $$
  select exists (
    select 1 from public.gegevens g, jsonb_array_elements(coalesce(g.data -> 'afspraken', '[]'::jsonb)) a
    where g.id = p_gebruiker and coalesce(a ->> 'start', '') ~ '^\d{4}-\d{2}-\d{2}'
      and case when (a ->> 'start') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}' then
            (left(a ->> 'start', 16)::timestamp at time zone 'Europe/Amsterdam') < p_tot + make_interval(mins => p_buffer)
            and (case when coalesce(a ->> 'einde', '') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}'
                      then left(a ->> 'einde', 16)::timestamp at time zone 'Europe/Amsterdam'
                      else (left(a ->> 'start', 16)::timestamp at time zone 'Europe/Amsterdam') + interval '1 hour' end)
                > p_van - make_interval(mins => p_buffer)
          else coalesce(a ->> 'soort', '') = 'reizen'
            and left(a ->> 'start', 10)::date = (p_van at time zone 'Europe/Amsterdam')::date end)
  or exists (
    select 1 from private.boekingen b
    where b.gebruiker_id = p_gebruiker and b.status in ('aangevraagd', 'bevestigd')
      and b.start < p_tot + make_interval(mins => p_buffer)
      and b.start + make_interval(mins => b.minuten) > p_van - make_interval(mins => p_buffer))
$$;

create or replace function private.boek_momenten(p private.boekpaginas, p_datum date, p_minuten integer)
returns setof timestamptz language sql stable security definer set search_path to '' as $$
  select m from (
    select distinct (t at time zone 'Europe/Amsterdam') m
    from jsonb_array_elements(coalesce(p.uren -> extract(isodow from p_datum)::text, '[]'::jsonb)) b,
         generate_series(p_datum + (b ->> 0)::time, p_datum + (b ->> 1)::time - make_interval(mins => p_minuten),
                         make_interval(mins => case when p_minuten < 30 then 15 else 30 end)) t
    where jsonb_typeof(b) = 'array' and jsonb_array_length(b) = 2
      and (b ->> 0) ~ '^\d{1,2}:\d{2}$' and (b ->> 1) ~ '^\d{1,2}:\d{2}$') x
  where m >= now() + make_interval(hours => p.min_vooraf) and m <= now() + make_interval(days => p.vooruit)
    and (select count(*) from private.boekingen b where b.gebruiker_id = p.gebruiker_id
         and b.status in ('aangevraagd', 'bevestigd')
         and (b.start at time zone 'Europe/Amsterdam')::date = p_datum) < p.max_per_dag
    and not private.boek_bezet(p.gebruiker_id, m, m + make_interval(mins => p_minuten), p.buffer)
  order by m
$$;

create or replace function private.boekpagina_json(p private.boekpaginas)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('adres', p.adres, 'aan', p.aan, 'titel', p.titel, 'intro', p.intro, 'soorten', p.soorten,
    'uren', p.uren, 'buffer', p.buffer, 'min_vooraf', p.min_vooraf, 'vooruit', p.vooruit, 'max_per_dag', p.max_per_dag,
    'bevestigen', p.bevestigen, 'locatie', p.locatie)
$$;

create or replace function private.boeking_json(b private.boekingen)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('id', b.id, 'soort', b.soort, 'start', b.start, 'minuten', b.minuten, 'naam', b.naam,
    'email', b.email, 'telefoon', b.telefoon, 'notitie', b.notitie, 'status', b.status, 'afspraak_id', b.afspraak_id,
    'verwerkt', b.verwerkt)
$$;

create or replace function public.boekpagina_instellen(p_naam text, p_wachtwoord text, p_instellingen jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); i jsonb := coalesce(p_instellingen, '{}'::jsonb);
  v_adres text := lower(trim(coalesce(i ->> 'adres', ''))); v_soorten jsonb; p private.boekpaginas;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if v_adres !~ '^[a-z0-9-]{3,40}$' then
    return jsonb_build_object('fout', 'Kies een linknaam van 3 tot 40 tekens: letters, cijfers en streepjes.');
  end if;
  if exists (select 1 from private.boekpaginas where adres = v_adres and gebruiker_id <> v_id) then
    return jsonb_build_object('fout', 'Deze linknaam is al in gebruik. Kies een andere.');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('naam', left(trim(s ->> 'naam'), 60),
                                               'minuten', least(480, greatest(10, (s ->> 'minuten')::int)))), '[]'::jsonb)
  into v_soorten
  from (select s from jsonb_array_elements(case when jsonb_typeof(i -> 'soorten') = 'array' then i -> 'soorten'
                                                else '[]'::jsonb end) s limit 6) x
  where trim(coalesce(s ->> 'naam', '')) <> '' and coalesce(s ->> 'minuten', '') ~ '^\d{1,3}$';
  if jsonb_array_length(v_soorten) = 0 then return jsonb_build_object('fout', 'Voeg minstens één soort afspraak toe.'); end if;
  insert into private.boekpaginas as b (gebruiker_id, adres, aan, titel, intro, soorten, uren, buffer, min_vooraf,
                                        vooruit, max_per_dag, bevestigen, locatie)
  values (v_id, v_adres, coalesce((i ->> 'aan')::boolean, false), left(coalesce(i ->> 'titel', ''), 80),
          left(coalesce(i ->> 'intro', ''), 400), v_soorten,
          case when jsonb_typeof(i -> 'uren') = 'object' then i -> 'uren' else '{}'::jsonb end,
          least(120, greatest(0, coalesce((i ->> 'buffer')::int, 15))),
          least(336, greatest(0, coalesce((i ->> 'min_vooraf')::int, 12))),
          least(90, greatest(1, coalesce((i ->> 'vooruit')::int, 30))),
          least(20, greatest(1, coalesce((i ->> 'max_per_dag')::int, 4))),
          coalesce((i ->> 'bevestigen')::boolean, false), left(coalesce(i ->> 'locatie', ''), 200))
  on conflict (gebruiker_id) do update set adres = excluded.adres, aan = excluded.aan, titel = excluded.titel,
    intro = excluded.intro, soorten = excluded.soorten, uren = excluded.uren, buffer = excluded.buffer,
    min_vooraf = excluded.min_vooraf, vooruit = excluded.vooruit, max_per_dag = excluded.max_per_dag,
    bevestigen = excluded.bevestigen, locatie = excluded.locatie
  returning * into p;
  return jsonb_build_object('ok', true, 'pagina', private.boekpagina_json(p));
end; $$;

create or replace function public.mijn_boekpagina(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); p private.boekpaginas;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into p from private.boekpaginas where gebruiker_id = v_id;
  return jsonb_build_object('pagina', case when p.gebruiker_id is null then null else private.boekpagina_json(p) end,
    'boekingen', coalesce((select jsonb_agg(private.boeking_json(b) order by b.start) from private.boekingen b
      where b.gebruiker_id = v_id and (b.start > now() - interval '1 day' or not b.verwerkt)), '[]'::jsonb));
end; $$;

-- Voor de bezoeker (zonder account): de pagina en de dagen met nog een vrij moment.
create or replace function public.boekpagina_bekijken(p_adres text, p_soort integer)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare p private.boekpaginas; v_minuten int;
begin
  select b.* into p from private.boekpaginas b join private.gebruikers u on u.id = b.gebruiker_id
  where b.adres = lower(coalesce(p_adres, '')) and b.aan and not u.verwijderd and not u.geblokkeerd;
  if p.gebruiker_id is null then return jsonb_build_object('fout', 'Deze boekingspagina bestaat niet (meer).'); end if;
  v_minuten := coalesce((p.soorten -> coalesce(p_soort, 0) ->> 'minuten')::int, (p.soorten -> 0 ->> 'minuten')::int, 30);
  return jsonb_build_object('naam', private.weergave(p.gebruiker_id), 'titel', p.titel, 'intro', p.intro,
    'soorten', p.soorten, 'locatie', p.locatie, 'bevestigen', p.bevestigen, 'dagen', coalesce((
      select jsonb_agg(d::date order by d) from generate_series(current_date, current_date + p.vooruit, interval '1 day') d
      where exists (select 1 from private.boek_momenten(p, d::date, v_minuten))), '[]'::jsonb));
end; $$;

create or replace function public.boekpagina_tijden(p_adres text, p_soort integer, p_datum date)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare p private.boekpaginas; v_minuten int;
begin
  select b.* into p from private.boekpaginas b join private.gebruikers u on u.id = b.gebruiker_id
  where b.adres = lower(coalesce(p_adres, '')) and b.aan and not u.verwijderd and not u.geblokkeerd;
  if p.gebruiker_id is null then return jsonb_build_object('fout', 'Deze boekingspagina bestaat niet (meer).'); end if;
  v_minuten := coalesce((p.soorten -> coalesce(p_soort, 0) ->> 'minuten')::int, 30);
  return jsonb_build_object('tijden', coalesce((select jsonb_agg(m) from private.boek_momenten(p, p_datum, v_minuten) m),
                                                '[]'::jsonb));
end; $$;

create or replace function public.boeken(p_adres text, p_soort integer, p_start timestamptz, p_kiezer text, p_email text,
                                         p_telefoon text, p_notitie text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare p private.boekpaginas; v_soort jsonb; v_code text := encode(extensions.gen_random_bytes(12), 'hex');
  v_naam text := left(trim(coalesce(p_kiezer, '')), 60); v_email text := lower(trim(coalesce(p_email, '')));
  b private.boekingen;
begin
  select bp.* into p from private.boekpaginas bp join private.gebruikers u on u.id = bp.gebruiker_id
  where bp.adres = lower(coalesce(p_adres, '')) and bp.aan and not u.verwijderd and not u.geblokkeerd;
  if p.gebruiker_id is null then return jsonb_build_object('fout', 'Deze boekingspagina bestaat niet (meer).'); end if;
  v_soort := p.soorten -> coalesce(p_soort, 0);
  if v_soort is null then return jsonb_build_object('fout', 'Kies wat voor afspraak.'); end if;
  if v_naam = '' then return jsonb_build_object('fout', 'Vul je naam in.'); end if;
  if v_email !~* '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' then
    return jsonb_build_object('fout', 'Vul een geldig e-mailadres in.');
  end if;
  perform pg_advisory_xact_lock(p.gebruiker_id);
  if (select count(*) from private.boekingen where gebruiker_id = p.gebruiker_id and aangemaakt > now() - interval '1 day') >= 30
     or (select count(*) from private.boekingen where gebruiker_id = p.gebruiker_id and lower(email) = v_email
         and status in ('aangevraagd', 'bevestigd') and start > now()) >= 3 then
    return jsonb_build_object('fout', 'Je kunt nu niet meer boeken. Probeer het later opnieuw.');
  end if;
  if not exists (select 1 from private.boek_momenten(p, (p_start at time zone 'Europe/Amsterdam')::date,
                                                       (v_soort ->> 'minuten')::int) m where m = p_start) then
    return jsonb_build_object('fout', 'Dit moment is net niet meer vrij. Kies een ander moment.');
  end if;
  insert into private.boekingen (gebruiker_id, soort, start, minuten, naam, email, telefoon, notitie, status, code_hash)
  values (p.gebruiker_id, v_soort ->> 'naam', p_start, (v_soort ->> 'minuten')::int, v_naam, v_email,
          left(trim(coalesce(p_telefoon, '')), 30), left(trim(coalesce(p_notitie, '')), 500),
          case when p.bevestigen then 'aangevraagd' else 'bevestigd' end, encode(extensions.digest(v_code, 'sha256'), 'hex'))
  returning * into b;
  perform private.push_inplannen(p.gebruiker_id, now(), 'reservering', 'boeking:' || b.id,
    case when p.bevestigen then 'Nieuwe aanvraag: ' else 'Nieuwe boeking: ' end || b.soort,
    v_naam || ', ' || to_char(p_start at time zone 'Europe/Amsterdam', 'DD-MM HH24:MI'));
  return jsonb_build_object('ok', true, 'code', v_code, 'status', b.status, 'start', b.start, 'minuten', b.minuten,
                            'soort', b.soort, 'naam', private.weergave(p.gebruiker_id), 'locatie', p.locatie);
end; $$;

create or replace function public.boeking_bekijken(p_code text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare b private.boekingen; p private.boekpaginas;
begin
  select * into b from private.boekingen where code_hash = encode(extensions.digest(coalesce(p_code, ''), 'sha256'), 'hex');
  if b.id is null then return jsonb_build_object('fout', 'Deze link werkt niet (meer).'); end if;
  select * into p from private.boekpaginas where gebruiker_id = b.gebruiker_id;
  return jsonb_build_object('soort', b.soort, 'start', b.start, 'minuten', b.minuten, 'status', b.status,
    'naam', private.weergave(b.gebruiker_id), 'locatie', coalesce(p.locatie, ''), 'adres', p.adres);
end; $$;

create or replace function public.boeking_annuleren(p_code text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare b private.boekingen;
begin
  update private.boekingen set status = 'geannuleerd', verwerkt = afspraak_id is null
  where code_hash = encode(extensions.digest(coalesce(p_code, ''), 'sha256'), 'hex')
    and status in ('aangevraagd', 'bevestigd') and start > now()
  returning * into b;
  if b.id is null then return jsonb_build_object('fout', 'Deze afspraak kan niet (meer) worden geannuleerd.'); end if;
  perform private.push_inplannen(b.gebruiker_id, now(), 'reservering', 'boeking-weg:' || b.id,
    'Geannuleerd: ' || b.soort, b.naam || ', ' || to_char(b.start at time zone 'Europe/Amsterdam', 'DD-MM HH24:MI'));
  return jsonb_build_object('ok', true);
end; $$;

-- De eigenaar: bevestigen, afwijzen of annuleren.
create or replace function public.boeking_afhandelen(p_naam text, p_wachtwoord text, p_id bigint, p_actie text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); b private.boekingen;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  update private.boekingen set
    status = case p_actie when 'bevestigen' then 'bevestigd' when 'afwijzen' then 'afgewezen' else 'geannuleerd' end,
    verwerkt = false
  where id = p_id and gebruiker_id = v_id and p_actie in ('bevestigen', 'afwijzen', 'annuleren')
    and case p_actie when 'bevestigen' then status = 'aangevraagd' when 'afwijzen' then status = 'aangevraagd'
                     else status in ('aangevraagd', 'bevestigd') end
  returning * into b;
  if b.id is null then return jsonb_build_object('fout', 'Dit kan niet (meer).'); end if;
  return jsonb_build_object('ok', true, 'boeking', private.boeking_json(b));
end; $$;

-- De app zette de boeking in de agenda (of haalde hem eruit).
create or replace function public.boeking_verwerkt(p_naam text, p_wachtwoord text, p_id bigint, p_afspraak text)
returns boolean language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return false; end if;
  update private.boekingen set verwerkt = true, afspraak_id = p_afspraak where id = p_id and gebruiker_id = v_id;
  return found;
end; $$;

revoke all on function private.boek_bezet(bigint, timestamptz, timestamptz, integer) from public, anon, authenticated;
revoke all on function private.boek_momenten(private.boekpaginas, date, integer) from public, anon, authenticated;
revoke all on function private.boekpagina_json(private.boekpaginas) from public, anon, authenticated;
revoke all on function private.boeking_json(private.boekingen) from public, anon, authenticated;
