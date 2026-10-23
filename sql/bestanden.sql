-- Bestanden, extra opslag en de gratis assistent.
--
-- Alle tools zijn gratis. Iedereen krijgt opslag voor eigen bestanden (private.platform.gratis_gb per persoon)
-- en de assistent werkt ook zonder eigen sleutel, tot een maandgrens per persoon (ai_gratis_euro).
-- Alleen extra opslag is betaald, per maand via Stripe (opslag_plannen; prijzen wijzigen zonder nieuwe code).
-- Na opzeggen blijven je bestanden staan; alleen nieuwe uploads passen dan niet meer als je boven de grens zit.
--
-- Bestanden staan in Supabase Storage (bucket 'bestanden', privé). Alleen de Edge Function `bestanden`
-- (service-rol) kan erbij; de app krijgt per keer een kortlevende link. Wie wat mag, staat hier.
--
-- Wie geen eigen sleutel heeft, gebruikt de assistent via de Edge Function `ai`: die gebruikt de sleutel van het
-- platform (private.platform.anthropic_sleutel, nooit terug te lezen) en houdt per maand bij wat het kost.
--
-- Niets wordt gewist: verwijderen is zacht (weg / verwijderd).

alter table private.platform add column if not exists gratis_gb numeric not null default 2;
-- Wat de gratis assistent per gebruiker per maand aan AI mag kosten (in euro), voor wie geen eigen sleutel heeft.
alter table private.platform add column if not exists ai_gratis_euro numeric not null default 1;
alter table private.platform add column if not exists anthropic_sleutel text not null default '';
-- Prijzen van het AI-model in euro per miljoen tokens (om de maandgrens te bewaken).
alter table private.platform add column if not exists ai_prijzen jsonb not null default
  '{"invoer": 4, "uitvoer": 20, "cache_lezen": 0.2, "cache_schrijven": 5, "zoekopdracht": 0.01}'::jsonb;
alter table private.platform add column if not exists opslag_plannen jsonb not null default '{
  "opslag_100": {"naam": "100 GB", "prijs": 2.99, "gb": 100},
  "opslag_1000": {"naam": "1 TB", "prijs": 7.99, "gb": 1000}
}'::jsonb;

create table if not exists private.abonnementen (
  id bigint generated always as identity primary key,
  gebruiker_id bigint not null references private.gebruikers(id),
  plan text not null,
  status text not null default 'incomplete',
  stripe_abonnement text unique,
  periode_tot timestamptz,
  opzeggen boolean not null default false,
  bijgewerkt timestamptz not null default now(),
  aangemaakt timestamptz not null default now()
);
create index if not exists abonnementen_gebruiker on private.abonnementen (gebruiker_id);
alter table private.abonnementen enable row level security;
alter table private.gebruikers add column if not exists stripe_klant text;

create table if not exists private.ai_gebruik (
  gebruiker_id bigint not null references private.gebruikers(id),
  maand date not null,
  euro numeric(10, 4) not null default 0,
  verzoeken int not null default 0,
  primary key (gebruiker_id, maand)
);
alter table private.ai_gebruik enable row level security;

create table if not exists private.bestanden (
  id bigint generated always as identity primary key,
  gebruiker_id bigint not null references private.gebruikers(id),
  soort text not null default 'bestand' check (soort in ('bestand', 'map')),
  map text not null default '',            -- de map waar het in staat, bijv. 'Foto''s/Vakantie'; '' = bovenaan
  naam text not null,
  grootte bigint not null default 0,
  mime text not null default '',
  pad text not null default '',            -- plek in de opslag: <gebruiker>/<willekeurig>
  status text not null default 'klaar' check (status in ('bezig', 'klaar')),
  weg boolean not null default false,      -- in de prullenbak
  weg_op timestamptz,
  verwijderd boolean not null default false,  -- echt weg uit de opslag
  aangemaakt timestamptz not null default now(),
  gewijzigd timestamptz not null default now()
);
create index if not exists bestanden_map on private.bestanden (gebruiker_id, map) where not verwijderd;
create unique index if not exists bestanden_naam on private.bestanden (gebruiker_id, map, lower(naam))
  where not weg and not verwijderd;
alter table private.bestanden enable row level security;

-- De opslagbucket (alleen in Supabase; lokaal bestaat storage niet). Privé, max 200 MB per bestand.
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('bestanden', 'bestanden', false, 209715200) on conflict (id) do nothing;
  end if;
end $$;

-- --- Wat iemand heeft -------------------------------------------------------------------------

-- Actieve opslagabonnementen: betaald (of de betaling loopt nog even) en niet verlopen.
create or replace function private.actieve_plannen(p_gebruiker bigint)
returns text[] language sql stable security definer set search_path to '' as $$
  select coalesce(array_agg(distinct plan), '{}') from private.abonnementen
  where gebruiker_id = p_gebruiker and status in ('active', 'trialing', 'past_due')
    and coalesce(periode_tot, now()) > now() - interval '3 days'
$$;

-- Wat je krijgt: opslag in bytes (gratis, of meer met een abonnement) en het AI-budget per maand in euro.
create or replace function private.rechten(p_gebruiker bigint)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare p private.platform; v_plannen text[] := private.actieve_plannen(p_gebruiker); v_gb numeric; v_plan text;
begin
  select * into p from private.platform where id = 1;
  v_gb := case when p_gebruiker = 1 then greatest(p.gratis_gb, 100) else p.gratis_gb end;
  foreach v_plan in array v_plannen loop
    v_gb := greatest(v_gb, coalesce((p.opslag_plannen -> v_plan ->> 'gb')::numeric, 0));
  end loop;
  return jsonb_build_object('plannen', to_jsonb(v_plannen), 'opslag', (v_gb * 1000000000)::bigint,
    'ai_euro', case when p_gebruiker = 1 then greatest(p.ai_gratis_euro, 50) else p.ai_gratis_euro end);
end; $$;

create or replace function private.opslag_gebruikt(p_gebruiker bigint)
returns bigint language sql stable security definer set search_path to '' as $$
  select coalesce(sum(grootte), 0)::bigint from private.bestanden
  where gebruiker_id = p_gebruiker and soort = 'bestand' and not verwijderd
    and (status = 'klaar' or aangemaakt > now() - interval '2 hours')
$$;

-- Een naam zonder schuine strepen, stuurtekens of rare spaties. Leeg = ongeldig.
create or replace function private.schone_naam(p_naam text)
returns text language sql immutable set search_path to '' as $$
  select nullif(left(btrim(regexp_replace(regexp_replace(coalesce(p_naam, ''), '[\x01-\x1f\x7f/\\]', '', 'g'),
                                          '\s+', ' ', 'g')), 200), '')
$$;

-- 'a/ b /c' → 'a/b/c'; elke map apart schoongemaakt; hoogstens 10 diep. NULL = ongeldig.
create or replace function private.schone_map(p_map text)
returns text language plpgsql immutable set search_path to '' as $$
declare v_delen text[] := '{}'; v_deel text; v_schoon text;
begin
  if coalesce(btrim(p_map), '') = '' then return ''; end if;
  foreach v_deel in array string_to_array(p_map, '/') loop
    continue when btrim(v_deel) = '';
    v_schoon := private.schone_naam(v_deel);
    if v_schoon is null or v_schoon in ('.', '..') then return null; end if;
    v_delen := v_delen || v_schoon;
  end loop;
  if array_length(v_delen, 1) > 10 then return null; end if;
  return coalesce(array_to_string(v_delen, '/'), '');
end; $$;

-- Een vrije naam in deze map: 'foto.jpg', anders 'foto (2).jpg', enzovoort.
create or replace function private.vrije_naam(p_gebruiker bigint, p_map text, p_naam text)
returns text language plpgsql stable security definer set search_path to '' as $$
declare v_basis text := p_naam; v_ext text := ''; v_naam text := p_naam; i int := 1;
begin
  if p_naam ~ '\.[A-Za-z0-9]{1,8}$' and p_naam !~ '^\.[^.]*$' then
    v_ext := substring(p_naam from '(\.[A-Za-z0-9]{1,8})$');
    v_basis := left(p_naam, length(p_naam) - length(v_ext));
  end if;
  while exists (select 1 from private.bestanden where gebruiker_id = p_gebruiker and map = p_map
                and lower(naam) = lower(v_naam) and not weg and not verwijderd) loop
    i := i + 1;
    v_naam := v_basis || ' (' || i || ')' || v_ext;
  end loop;
  return v_naam;
end; $$;

-- --- Voor de app (met naam en wachtwoord/sessie) --------------------------------------------------

-- Hoeveel opslag je hebt en gebruikt, je opslagabonnement, en of de gratis assistent aan staat.
create or replace function public.toegang_status(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_maand date := date_trunc('month', now())::date;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return private.rechten(v_id) || jsonb_build_object(
    'gebruikt', private.opslag_gebruikt(v_id),
    'gratis_gb', (select gratis_gb from private.platform where id = 1),
    'ai_platform', (select anthropic_sleutel <> '' and ai_gratis_euro > 0 from private.platform where id = 1),
    'ai_gratis_euro', (select ai_gratis_euro from private.platform where id = 1),
    'ai_gebruikt', coalesce((select euro from private.ai_gebruik where gebruiker_id = v_id and maand = v_maand), 0),
    'aanbod', (select opslag_plannen from private.platform where id = 1),
    'betalen_aan', (select stripe_sleutel <> '' from private.platform where id = 1),
    'klant', (select stripe_klant is not null from private.gebruikers where id = v_id),
    'abonnementen', coalesce((select jsonb_agg(jsonb_build_object('plan', plan, 'status', status,
        'periode_tot', periode_tot, 'opzeggen', opzeggen) order by id)
      from private.abonnementen where gebruiker_id = v_id and status in ('active', 'trialing', 'past_due')
        and coalesce(periode_tot, now()) > now() - interval '3 days'), '[]'::jsonb));
end; $$;

-- Alleen de eigenaar: de Anthropic-sleutel van het platform (voor de gratis assistent), de maandgrens per persoon
-- en de opslag per persoon. Leeg laten = niet wijzigen. De sleutel is nooit terug te lezen.
create or replace function public.toegang_instellen(p_naam text, p_wachtwoord text, p_anthropic_sleutel text,
                                                    p_ai_gratis_euro numeric, p_gratis_gb numeric)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if v_id <> 1 then return jsonb_build_object('fout', 'Alleen de eigenaar kan dit instellen.'); end if;
  if coalesce(p_anthropic_sleutel, '') <> '' and (p_anthropic_sleutel !~ '^sk-ant-[A-Za-z0-9_-]{20,200}$') then
    return jsonb_build_object('fout', 'Dit ziet er niet uit als een Anthropic-sleutel.');
  end if;
  update private.platform set
    anthropic_sleutel = coalesce(nullif(p_anthropic_sleutel, ''), anthropic_sleutel),
    ai_gratis_euro = coalesce(least(greatest(p_ai_gratis_euro, 0), 20), ai_gratis_euro),
    gratis_gb = coalesce(least(greatest(p_gratis_gb, 0.1), 1000), gratis_gb)
  where id = 1;
  return jsonb_build_object('ok', true);
end; $$;

-- De bestanden in een map (of je prullenbak), met wat je gebruikt en mag. In de prullenbak alleen wat je zelf
-- weggooide, niet alles wat in een weggegooide map zat.
create or replace function public.bestanden_lijst(p_naam text, p_wachtwoord text, p_map text, p_prullenbak boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_map text := private.schone_map(p_map);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if v_map is null then return jsonb_build_object('fout', 'Onbekende map.'); end if;
  return jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'soort', soort, 'map', map, 'naam', naam,
        'grootte', grootte, 'mime', mime, 'gewijzigd', gewijzigd, 'weg_op', weg_op)
        order by soort desc, lower(naam))
      from private.bestanden b where gebruiker_id = v_id and not verwijderd and status = 'klaar'
        and (case when coalesce(p_prullenbak, false)
                  then weg and not exists (select 1 from private.bestanden m where m.gebruiker_id = v_id
                    and m.soort = 'map' and m.weg and not m.verwijderd
                    and (case when m.map = '' then m.naam else m.map || '/' || m.naam end) = b.map)
                  else not weg and map = v_map end)), '[]'::jsonb),
    'gebruikt', private.opslag_gebruikt(v_id),
    'opslag', (private.rechten(v_id) ->> 'opslag')::bigint,
    'prullenbak', (select count(*) from private.bestanden where gebruiker_id = v_id and weg and not verwijderd));
end; $$;

-- Alle mappen (voor verplaatsen), als pad: 'Foto''s', 'Foto''s/Vakantie'.
create or replace function public.bestanden_mappen(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object('mappen', coalesce((select jsonb_agg(p order by lower(p)) from (
      select case when map = '' then naam else map || '/' || naam end as p from private.bestanden
      where gebruiker_id = v_id and soort = 'map' and not weg and not verwijderd) t), '[]'::jsonb));
end; $$;

create or replace function public.bestanden_zoeken(p_naam text, p_wachtwoord text, p_zoek text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object('items', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'soort', soort, 'map', map,
      'naam', naam, 'grootte', grootte, 'mime', mime, 'gewijzigd', gewijzigd) order by gewijzigd desc)
    from (select * from private.bestanden where gebruiker_id = v_id and not weg and not verwijderd and status = 'klaar'
            and naam ilike '%' || replace(replace(replace(left(coalesce(p_zoek, ''), 100), '\', '\\'), '%', '\%'), '_', '\_') || '%'
          order by gewijzigd desc limit 50) b), '[]'::jsonb));
end; $$;

create or replace function public.bestand_map_maken(p_naam text, p_wachtwoord text, p_map text, p_mapnaam text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_map text := private.schone_map(p_map);
        v_mapnaam text := private.schone_naam(p_mapnaam);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if v_map is null or v_mapnaam is null then return jsonb_build_object('fout', 'Kies een naam zonder schuine streep.'); end if;
  if (select count(*) from private.bestanden where gebruiker_id = v_id and soort = 'map' and not verwijderd) >= 1000 then
    return jsonb_build_object('fout', 'Je hebt al heel veel mappen.');
  end if;
  if exists (select 1 from private.bestanden where gebruiker_id = v_id and map = v_map and lower(naam) = lower(v_mapnaam)
             and not weg and not verwijderd) then
    return jsonb_build_object('fout', 'Hier staat al iets met die naam.');
  end if;
  if v_map <> '' and private.schone_map(v_map || '/' || v_mapnaam) is null then
    return jsonb_build_object('fout', 'Zo diep kan niet.');
  end if;
  insert into private.bestanden (gebruiker_id, soort, map, naam) values (v_id, 'map', v_map, v_mapnaam);
  return jsonb_build_object('ok', true);
end; $$;

-- Hernoemen of verplaatsen. Bij een map gaat alles wat erin staat mee.
create or replace function public.bestand_wijzigen(p_naam text, p_wachtwoord text, p_id bigint, p_nieuwe_naam text,
                                                   p_nieuwe_map text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); b private.bestanden; v_naam text; v_map text;
        v_oud text; v_nieuw text;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into b from private.bestanden where id = p_id and gebruiker_id = v_id and not weg and not verwijderd
    and status = 'klaar';
  if b.id is null then return jsonb_build_object('fout', 'Niet gevonden.'); end if;
  v_naam := coalesce(private.schone_naam(p_nieuwe_naam), b.naam);
  v_map := case when p_nieuwe_map is null then b.map else private.schone_map(p_nieuwe_map) end;
  if v_map is null then return jsonb_build_object('fout', 'Onbekende map.'); end if;
  if v_map <> '' and not exists (select 1 from private.bestanden where gebruiker_id = v_id and soort = 'map'
      and not weg and not verwijderd and (case when map = '' then naam else map || '/' || naam end) = v_map) then
    return jsonb_build_object('fout', 'Die map bestaat niet.');
  end if;
  if v_naam = b.naam and v_map = b.map then return jsonb_build_object('ok', true); end if;
  if exists (select 1 from private.bestanden where gebruiker_id = v_id and map = v_map and lower(naam) = lower(v_naam)
             and id <> b.id and not weg and not verwijderd) then
    return jsonb_build_object('fout', 'Daar staat al iets met die naam.');
  end if;
  if b.soort = 'map' then
    v_oud := case when b.map = '' then b.naam else b.map || '/' || b.naam end;
    v_nieuw := case when v_map = '' then v_naam else v_map || '/' || v_naam end;
    if v_map = v_oud or v_map like v_oud || '/%' then
      return jsonb_build_object('fout', 'Een map kan niet in zichzelf.');
    end if;
    if private.schone_map(v_nieuw) is null or exists (select 1 from private.bestanden where gebruiker_id = v_id
        and not verwijderd and map like v_oud || '/%' and private.schone_map(v_nieuw || substr(map, length(v_oud) + 1)) is null) then
      return jsonb_build_object('fout', 'Zo diep kan niet.');
    end if;
    update private.bestanden set map = v_nieuw || substr(map, length(v_oud) + 1), gewijzigd = now()
    where gebruiker_id = v_id and not verwijderd and (map = v_oud or map like v_oud || '/%');
  end if;
  update private.bestanden set naam = v_naam, map = v_map, gewijzigd = now() where id = b.id;
  return jsonb_build_object('ok', true);
end; $$;

-- Naar de prullenbak (een map met alles erin), of terugzetten. Na 30 dagen gaat het echt weg. Terugzetten gaat
-- naar de oude plek (met een nummer als de naam bezet is), of bovenaan als die map er niet meer is.
create or replace function public.bestand_prullenbak(p_naam text, p_wachtwoord text, p_id bigint, p_weg boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); b private.bestanden; v_pad text; v_naam text;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into b from private.bestanden where id = p_id and gebruiker_id = v_id and not verwijderd and status = 'klaar'
    and weg = not coalesce(p_weg, true);
  if b.id is null then return jsonb_build_object('fout', 'Niet gevonden.'); end if;
  v_pad := case when b.map = '' then b.naam else b.map || '/' || b.naam end;
  if coalesce(p_weg, true) then
    update private.bestanden set weg = true, weg_op = now()
    where gebruiker_id = v_id and not weg and not verwijderd
      and (id = b.id or (b.soort = 'map' and (map = v_pad or map like v_pad || '/%')));
  else
    if b.map <> '' and not exists (select 1 from private.bestanden where gebruiker_id = v_id and soort = 'map'
        and not weg and not verwijderd and (case when map = '' then naam else map || '/' || naam end) = b.map) then
      b.map := '';
    end if;
    v_naam := private.vrije_naam(v_id, b.map, b.naam);
    update private.bestanden set weg = false, weg_op = null, map = b.map, naam = v_naam where id = b.id;
    if b.soort = 'map' then
      update private.bestanden set weg = false, weg_op = null,
        map = (case when b.map = '' then v_naam else b.map || '/' || v_naam end) || substr(map, length(v_pad) + 1)
      where gebruiker_id = v_id and weg and not verwijderd and (map = v_pad or map like v_pad || '/%')
        and weg_op >= b.weg_op - interval '1 minute';
    end if;
  end if;
  return jsonb_build_object('ok', true);
end; $$;

-- --- Alleen voor de Edge Functions `bestanden`, `ai` en `betalen` (service-rol) ------------------

-- Ruimte vastleggen voor een upload. Geeft {id, pad} of {fout}.
create or replace function public.bestand_reserveren(p_gebruiker bigint, p_map text, p_naam text, p_grootte bigint,
                                                     p_mime text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_map text := private.schone_map(p_map); v_naam text := private.schone_naam(p_naam); v_nieuw bigint;
        v_pad text;
begin
  if v_map is null or v_naam is null then return jsonb_build_object('fout', 'Ongeldige naam.'); end if;
  if coalesce(p_grootte, -1) < 0 or p_grootte > 209715200 then
    return jsonb_build_object('fout', 'Een bestand mag hoogstens 200 MB zijn.');
  end if;
  if v_map <> '' and not exists (select 1 from private.bestanden where gebruiker_id = p_gebruiker and soort = 'map'
      and not weg and not verwijderd and (case when map = '' then naam else map || '/' || naam end) = v_map) then
    return jsonb_build_object('fout', 'Die map bestaat niet.');
  end if;
  if (select count(*) from private.bestanden where gebruiker_id = p_gebruiker and status = 'bezig' and not verwijderd
      and aangemaakt > now() - interval '2 hours') >= 10 then
    return jsonb_build_object('fout', 'Er lopen al veel uploads. Probeer het zo opnieuw.');
  end if;
  if private.opslag_gebruikt(p_gebruiker) + p_grootte > (private.rechten(p_gebruiker) ->> 'opslag')::bigint then
    return jsonb_build_object('fout', 'Je opslag is vol.', 'vol', true);
  end if;
  v_naam := private.vrije_naam(p_gebruiker, v_map, v_naam);
  v_pad := p_gebruiker || '/' || replace(extensions.gen_random_uuid()::text, '-', '');
  insert into private.bestanden (gebruiker_id, map, naam, grootte, mime, pad, status)
  values (p_gebruiker, v_map, v_naam, p_grootte, left(coalesce(p_mime, ''), 100), v_pad, 'bezig')
  returning id into v_nieuw;
  return jsonb_build_object('id', v_nieuw, 'pad', v_pad);
end; $$;

-- Na de upload: de echte grootte telt. Past het niet meer, dan moet het weg (de functie wist het bestand).
create or replace function public.bestand_bevestigen(p_gebruiker bigint, p_id bigint, p_grootte bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare b private.bestanden;
begin
  select * into b from private.bestanden where id = p_id and gebruiker_id = p_gebruiker and status = 'bezig'
    and not verwijderd for update;
  if b.id is null then return jsonb_build_object('fout', 'Niet gevonden.'); end if;
  if p_grootte is null or p_grootte < 0 or p_grootte > 209715200 or private.opslag_gebruikt(p_gebruiker) - b.grootte + p_grootte
     > (private.rechten(p_gebruiker) ->> 'opslag')::bigint then
    update private.bestanden set verwijderd = true where id = b.id;
    return jsonb_build_object('fout', 'Je opslag is vol.', 'pad', b.pad, 'vol', true);
  end if;
  update private.bestanden set status = 'klaar', grootte = p_grootte, gewijzigd = now() where id = b.id;
  return jsonb_build_object('ok', true);
end; $$;

create or replace function public.bestand_pad_bezig(p_gebruiker bigint, p_id bigint)
returns text language sql security definer set search_path to '' as $$
  select pad from private.bestanden where id = p_id and gebruiker_id = p_gebruiker and status = 'bezig'
    and not verwijderd
$$;

create or replace function public.bestand_pad(p_gebruiker bigint, p_id bigint)
returns jsonb language sql security definer set search_path to '' as $$
  select jsonb_build_object('pad', pad, 'naam', naam, 'mime', mime, 'grootte', grootte)
  from private.bestanden where id = p_id and gebruiker_id = p_gebruiker and soort = 'bestand' and status = 'klaar'
    and not verwijderd
$$;

-- Wat echt uit de opslag mag: verlopen prullenbak (30 dagen), afgebroken uploads, of nu meteen
-- (p_id: één ding uit je prullenbak, met alles erin; p_alles: alles, bij het verwijderen van je account).
create or replace function public.bestanden_op_te_ruimen(p_gebruiker bigint, p_id bigint, p_alles boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare b private.bestanden; v_pad text;
begin
  if p_id is not null then
    select * into b from private.bestanden where id = p_id and gebruiker_id = p_gebruiker and weg and not verwijderd;
    if b.id is null then return '[]'::jsonb; end if;
    v_pad := case when b.map = '' then b.naam else b.map || '/' || b.naam end;
    return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'pad', pad)) from private.bestanden
      where gebruiker_id = p_gebruiker and weg and not verwijderd
        and (id = b.id or (b.soort = 'map' and (map = v_pad or map like v_pad || '/%')))), '[]'::jsonb);
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'pad', pad)) from (
      select id, pad from private.bestanden where gebruiker_id = p_gebruiker and not verwijderd
        and (coalesce(p_alles, false) or (weg and weg_op < now() - interval '30 days')
             or (status = 'bezig' and aangemaakt < now() - interval '2 hours'))
      limit 500) t), '[]'::jsonb);
end; $$;

create or replace function public.bestanden_verwijderd(p_gebruiker bigint, p_ids bigint[])
returns int language plpgsql security definer set search_path to '' as $$
declare v_aantal int;
begin
  update private.bestanden set verwijderd = true, weg = true, weg_op = coalesce(weg_op, now())
  where gebruiker_id = p_gebruiker and id = any(p_ids) and not verwijderd;
  get diagnostics v_aantal = row_count;
  return v_aantal;
end; $$;

-- Voor de assistent zonder eigen sleutel: mag deze gebruiker nog, en met welke sleutel.
create or replace function public.ai_toegang(p_gebruiker bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_budget numeric := (private.rechten(p_gebruiker) ->> 'ai_euro')::numeric;
        v_gebruikt numeric := coalesce((select euro from private.ai_gebruik where gebruiker_id = p_gebruiker
                                        and maand = date_trunc('month', now())::date), 0);
begin
  if v_budget <= 0 then return jsonb_build_object('fout', 'De assistent staat even uit.'); end if;
  if v_gebruikt >= v_budget then
    return jsonb_build_object('fout', 'Je hebt de assistent deze maand al veel gebruikt. Volgende maand kan het weer.');
  end if;
  return coalesce((select jsonb_build_object('sleutel', anthropic_sleutel, 'prijzen', ai_prijzen) from private.platform
          where id = 1 and anthropic_sleutel <> ''), jsonb_build_object('fout', 'De assistent staat nog niet aan.'));
end; $$;

create or replace function public.ai_gebruik_bij(p_gebruiker bigint, p_euro numeric)
returns void language sql security definer set search_path to '' as $$
  insert into private.ai_gebruik (gebruiker_id, maand, euro, verzoeken)
  values (p_gebruiker, date_trunc('month', now())::date, greatest(coalesce(p_euro, 0), 0), 1)
  on conflict (gebruiker_id, maand) do update
    set euro = private.ai_gebruik.euro + excluded.euro, verzoeken = private.ai_gebruik.verzoeken + 1
$$;

-- Voor het opslagabonnement via Stripe.
create or replace function public.abonnement_klant(p_gebruiker bigint)
returns jsonb language sql security definer set search_path to '' as $$
  select jsonb_build_object('id', g.id, 'email', g.email, 'klant', g.stripe_klant,
    'aanbod', p.opslag_plannen, 'app_adres', p.app_adres,
    'abonnementen', coalesce((select jsonb_agg(jsonb_build_object('plan', a.plan, 'status', a.status,
        'stripe_abonnement', a.stripe_abonnement)) from private.abonnementen a
      where a.gebruiker_id = g.id and a.status in ('active', 'trialing', 'past_due', 'incomplete')), '[]'::jsonb))
  from private.gebruikers g, private.platform p where g.id = p_gebruiker and p.id = 1
$$;

create or replace function public.abonnement_klant_opslaan(p_gebruiker bigint, p_klant text)
returns void language sql security definer set search_path to '' as $$
  update private.gebruikers set stripe_klant = p_klant where id = p_gebruiker and stripe_klant is null
$$;

-- Stripe meldt de stand van een abonnement (na afrekenen, bij terugkomst, of via de webhook).
create or replace function public.abonnement_opslaan(p_klant text, p_abonnement text, p_plan text, p_status text,
                                                     p_tot timestamptz, p_opzeggen boolean)
returns boolean language plpgsql security definer set search_path to '' as $$
declare v_gebruiker bigint := (select id from private.gebruikers where stripe_klant = p_klant);
begin
  if v_gebruiker is null or coalesce(p_abonnement, '') = ''
     or not ((select opslag_plannen from private.platform where id = 1) ? p_plan) then
    return false;
  end if;
  insert into private.abonnementen (gebruiker_id, plan, status, stripe_abonnement, periode_tot, opzeggen, bijgewerkt)
  values (v_gebruiker, p_plan, left(p_status, 30), p_abonnement, p_tot, coalesce(p_opzeggen, false), now())
  on conflict (stripe_abonnement) do update set plan = excluded.plan, status = excluded.status,
    periode_tot = excluded.periode_tot, opzeggen = excluded.opzeggen, bijgewerkt = now()
  where private.abonnementen.gebruiker_id = v_gebruiker;
  return true;
end; $$;

-- Wie zijn account verwijdert: bestanden in de prullenbak (de app wist ze daarna echt uit de opslag).
create or replace function private.bestanden_account_weg()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.verwijderd and not old.verwijderd then
    update private.bestanden set weg = true, weg_op = now() - interval '31 days' where gebruiker_id = new.id
      and not verwijderd;
  end if;
  return new;
end; $$;

create or replace trigger bestanden_account_weg after update of verwijderd on private.gebruikers
  for each row execute function private.bestanden_account_weg();

-- --- Rechten --------------------------------------------------------------------------------

revoke all on function private.bestanden_account_weg(), private.rechten(bigint), private.actieve_plannen(bigint),
  private.opslag_gebruikt(bigint), private.vrije_naam(bigint, text, text) from public, anon, authenticated;
revoke all on function public.bestand_reserveren(bigint, text, text, bigint, text),
  public.bestand_bevestigen(bigint, bigint, bigint), public.bestand_pad(bigint, bigint),
  public.bestand_pad_bezig(bigint, bigint),
  public.bestanden_op_te_ruimen(bigint, bigint, boolean), public.bestanden_verwijderd(bigint, bigint[]),
  public.ai_toegang(bigint), public.ai_gebruik_bij(bigint, numeric), public.abonnement_klant(bigint),
  public.abonnement_klant_opslaan(bigint, text),
  public.abonnement_opslaan(text, text, text, text, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.bestand_reserveren(bigint, text, text, bigint, text),
  public.bestand_bevestigen(bigint, bigint, bigint), public.bestand_pad(bigint, bigint),
  public.bestand_pad_bezig(bigint, bigint),
  public.bestanden_op_te_ruimen(bigint, bigint, boolean), public.bestanden_verwijderd(bigint, bigint[]),
  public.ai_toegang(bigint), public.ai_gebruik_bij(bigint, numeric), public.abonnement_klant(bigint),
  public.abonnement_klant_opslaan(bigint, text),
  public.abonnement_opslaan(text, text, text, text, timestamptz, boolean) to service_role;
