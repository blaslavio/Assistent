-- Reserveringsaanvragen bij plekken die (nog) niet in de app zitten, zoals een restaurant uit de buurt.
-- De gast stuurt de aanvraag zelf (eigen mail, bellen of website). In de mail staat een link waarmee het restaurant
-- zonder account bevestigt, een ander tijdstip voorstelt of afzegt. De link bevat een geheime code; we bewaren
-- alleen de hash. Een restaurant kan zich afmelden voor aanvragen; de beheerder ziet welke plekken veel worden
-- gevraagd (om ze uit te nodigen) en handelt meldingen af.

create table if not exists private.aanvragen (
  id bigint generated always as identity primary key,
  gast bigint not null references private.gebruikers(id),
  plek text not null,
  plek_adres text not null default '',
  plek_sleutel text not null,
  email text not null default '',
  telefoon text not null default '',
  website text not null default '',
  start timestamptz not null,
  minuten integer not null default 120 check (minuten between 15 and 720),
  personen integer not null default 2 check (personen between 1 and 100),
  opmerking text not null default '',
  gelegenheid text not null default '',
  kanaal text not null default 'mail' check (kanaal in ('mail', 'telefoon', 'website', 'anders')),
  code_hash text not null unique,
  status text not null default 'aangevraagd'
    check (status in ('aangevraagd', 'bevestigd', 'afgewezen', 'voorstel', 'geannuleerd')),
  voorstel timestamptz,
  antwoord text not null default '',
  beantwoord timestamptz,
  door_plek boolean not null default false,
  interesse boolean not null default false,
  gemeld text not null default '',
  aangemaakt timestamptz not null default now(),
  gewijzigd timestamptz not null default now()
);
create index if not exists aanvragen_gast on private.aanvragen (gast, start);
create index if not exists aanvragen_plek on private.aanvragen (plek_sleutel);

-- Plekken die geen aanvragen via de app meer willen (op mailadres of naam en adres).
create table if not exists private.aanvraag_stop (
  sleutel text primary key,
  reden text not null default '',
  aan boolean not null default true,
  aangemaakt timestamptz not null default now()
);

alter table private.aanvragen enable row level security;
alter table private.aanvraag_stop enable row level security;

create or replace function private.plek_sleutel(p_naam text, p_adres text)
returns text language sql immutable set search_path to '' as $$
  select lower(regexp_replace(trim(coalesce(p_naam, '')), '\s+', ' ', 'g')) || '|' ||
         lower(regexp_replace(trim(coalesce(p_adres, '')), '\s+', ' ', 'g'))
$$;

create or replace function private.aanvraag_gestopt(p_sleutel text, p_email text)
returns boolean language sql stable security definer set search_path to '' as $$
  select exists (select 1 from private.aanvraag_stop s where s.aan
                 and (s.sleutel = p_sleutel or (coalesce(p_email, '') <> '' and s.sleutel = 'mail:' || lower(trim(p_email)))))
$$;

-- Wat het restaurant ziet: geen mailadres of telefoon van de gast, alleen de weergavenaam.
create or replace function private.aanvraag_json(a private.aanvragen)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('id', a.id, 'plek', a.plek, 'plek_adres', a.plek_adres, 'email', a.email,
    'telefoon', a.telefoon, 'website', a.website, 'start', a.start, 'minuten', a.minuten, 'personen', a.personen,
    'opmerking', a.opmerking, 'gelegenheid', a.gelegenheid, 'kanaal', a.kanaal, 'status', a.status,
    'voorstel', a.voorstel, 'antwoord', a.antwoord, 'beantwoord', a.beantwoord, 'door_plek', a.door_plek)
$$;

-- De gast maakt een aanvraag. De code (voor de link) komt alleen nu terug.
create or replace function public.aanvraag_maken(p_naam text, p_wachtwoord text, p_plek jsonb, p_start timestamptz,
                                                 p_minuten integer, p_personen integer, p_opmerking text,
                                                 p_gelegenheid text, p_kanaal text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
  v_naam text := left(trim(coalesce(p_plek ->> 'naam', '')), 120);
  v_adres text := left(trim(coalesce(p_plek ->> 'adres', '')), 200);
  v_email text := lower(left(trim(coalesce(p_plek ->> 'email', '')), 200));
  v_sleutel text; v_code text := encode(extensions.gen_random_bytes(18), 'hex'); v_nieuw bigint;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if v_naam = '' then return jsonb_build_object('fout', 'Vul de naam van de plek in.'); end if;
  if v_email <> '' and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('fout', 'Dit mailadres klopt niet.');
  end if;
  if p_start is null or p_start < now() or p_start > now() + interval '1 year' then
    return jsonb_build_object('fout', 'Kies een moment in de toekomst.');
  end if;
  v_sleutel := private.plek_sleutel(v_naam, v_adres);
  if private.aanvraag_gestopt(v_sleutel, v_email) then
    return jsonb_build_object('fout', v_naam || ' wil geen aanvragen via de app. Bel of reserveer via hun website.',
                              'gestopt', true);
  end if;
  if (select count(*) from private.aanvragen where gast = v_id and aangemaakt > now() - interval '1 day') >= 10 then
    return jsonb_build_object('fout', 'Je hebt vandaag al veel aanvragen gedaan. Probeer het morgen weer.');
  end if;
  if (select count(*) from private.aanvragen where gast = v_id and plek_sleutel = v_sleutel
      and status in ('aangevraagd', 'voorstel') and start > now()) >= 2 then
    return jsonb_build_object('fout', 'Je hebt hier al een open aanvraag. Wacht op antwoord of annuleer die eerst.');
  end if;
  insert into private.aanvragen (gast, plek, plek_adres, plek_sleutel, email, telefoon, website, start, minuten,
                                 personen, opmerking, gelegenheid, kanaal, code_hash)
  values (v_id, v_naam, v_adres, v_sleutel, v_email, left(trim(coalesce(p_plek ->> 'telefoon', '')), 40),
          left(trim(coalesce(p_plek ->> 'website', '')), 300), p_start,
          least(720, greatest(15, coalesce(p_minuten, 120))), least(100, greatest(1, coalesce(p_personen, 2))),
          left(coalesce(p_opmerking, ''), 500), left(coalesce(p_gelegenheid, ''), 40),
          case when p_kanaal in ('mail', 'telefoon', 'website') then p_kanaal else 'anders' end,
          encode(extensions.digest(v_code, 'sha256'), 'hex'))
  returning id into v_nieuw;
  return jsonb_build_object('ok', true, 'id', v_nieuw, 'code', v_code, 'gast', private.weergave(v_id));
end; $$;

create or replace function public.mijn_aanvragen(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object('aanvragen', coalesce((select jsonb_agg(private.aanvraag_json(a) order by a.start)
    from private.aanvragen a where a.gast = v_id and a.start > now() - interval '1 day'), '[]'::jsonb));
end; $$;

-- De gast zelf: bevestigd (na bellen of via de website), annuleren, of het voorstel van het restaurant aannemen.
create or replace function public.aanvraag_bijwerken(p_naam text, p_wachtwoord text, p_id bigint, p_status text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); a private.aanvragen;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into a from private.aanvragen where id = p_id and gast = v_id for update;
  if a.id is null then return jsonb_build_object('fout', 'Aanvraag niet gevonden.'); end if;
  if p_status = 'voorstel_aannemen' then
    if a.status <> 'voorstel' or a.voorstel is null then return jsonb_build_object('fout', 'Er is geen voorstel.'); end if;
    update private.aanvragen set start = a.voorstel, voorstel = null, status = 'bevestigd', gewijzigd = now() where id = a.id;
  elsif p_status = 'bevestigd' and a.status in ('aangevraagd', 'voorstel') then
    update private.aanvragen set status = 'bevestigd', door_plek = false, gewijzigd = now() where id = a.id;
  elsif p_status = 'geannuleerd' and a.status in ('aangevraagd', 'voorstel', 'bevestigd') then
    update private.aanvragen set status = 'geannuleerd', door_plek = false, gewijzigd = now() where id = a.id;
  else
    return jsonb_build_object('fout', 'Dat kan niet meer bij deze aanvraag.');
  end if;
  select * into a from private.aanvragen where id = p_id;
  return jsonb_build_object('ok', true, 'aanvraag', private.aanvraag_json(a));
end; $$;

-- Voor het restaurant, zonder account: de link met code.
create or replace function private.aanvraag_via_code(p_code text)
returns private.aanvragen language sql stable security definer set search_path to '' as $$
  select * from private.aanvragen
  where code_hash = encode(extensions.digest(coalesce(p_code, ''), 'sha256'), 'hex')
$$;

create or replace function public.aanvraag_bekijken(p_code text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare a private.aanvragen := private.aanvraag_via_code(p_code);
begin
  if a.id is null then return jsonb_build_object('fout', 'Deze link werkt niet (meer).'); end if;
  return private.aanvraag_json(a) - 'email' - 'telefoon' - 'website' - 'id'
         || jsonb_build_object('gast', private.weergave(a.gast), 'interesse', a.interesse,
                               'gestopt', private.aanvraag_gestopt(a.plek_sleutel, a.email));
end; $$;

create or replace function public.aanvraag_beantwoorden(p_code text, p_antwoord text, p_voorstel timestamptz,
                                                        p_tekst text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare a private.aanvragen := private.aanvraag_via_code(p_code);
begin
  if a.id is null then return jsonb_build_object('fout', 'Deze link werkt niet (meer).'); end if;
  if a.status = 'geannuleerd' then return jsonb_build_object('fout', 'De gast heeft deze aanvraag geannuleerd.'); end if;
  if a.start < now() - interval '2 hours' then return jsonb_build_object('fout', 'Deze aanvraag is verlopen.'); end if;
  if p_antwoord = 'ja' then
    update private.aanvragen set status = 'bevestigd', voorstel = null, door_plek = true, beantwoord = now(),
      antwoord = left(coalesce(p_tekst, ''), 500), gewijzigd = now() where id = a.id;
  elsif p_antwoord = 'nee' then
    update private.aanvragen set status = 'afgewezen', voorstel = null, door_plek = true, beantwoord = now(),
      antwoord = left(coalesce(p_tekst, ''), 500), gewijzigd = now() where id = a.id;
  elsif p_antwoord = 'voorstel' then
    if p_voorstel is null or p_voorstel < now() or p_voorstel > now() + interval '1 year' then
      return jsonb_build_object('fout', 'Kies een ander moment in de toekomst.');
    end if;
    update private.aanvragen set status = 'voorstel', voorstel = p_voorstel, door_plek = true, beantwoord = now(),
      antwoord = left(coalesce(p_tekst, ''), 500), gewijzigd = now() where id = a.id;
  else
    return jsonb_build_object('fout', 'Onbekend antwoord.');
  end if;
  return jsonb_build_object('ok', true);
end; $$;

-- Restaurant wil gratis aansluiten (de beheerder ziet dit), of geen aanvragen meer.
create or replace function public.aanvraag_interesse(p_code text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare a private.aanvragen := private.aanvraag_via_code(p_code);
begin
  if a.id is null then return jsonb_build_object('fout', 'Deze link werkt niet (meer).'); end if;
  update private.aanvragen set interesse = true where id = a.id;
  return jsonb_build_object('ok', true);
end; $$;

create or replace function public.aanvraag_stoppen(p_code text, p_reden text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare a private.aanvragen := private.aanvraag_via_code(p_code);
begin
  if a.id is null then return jsonb_build_object('fout', 'Deze link werkt niet (meer).'); end if;
  insert into private.aanvraag_stop (sleutel, reden) values (a.plek_sleutel, left(coalesce(p_reden, ''), 300))
  on conflict (sleutel) do update set aan = true, reden = excluded.reden;
  if a.email <> '' then
    insert into private.aanvraag_stop (sleutel, reden) values ('mail:' || a.email, left(coalesce(p_reden, ''), 300))
    on conflict (sleutel) do update set aan = true, reden = excluded.reden;
  end if;
  update private.aanvragen set interesse = false where plek_sleutel = a.plek_sleutel;
  return jsonb_build_object('ok', true);
end; $$;

-- Het restaurant meldt misbruik (bijvoorbeeld nepreserveringen); de beheerder kijkt ernaar.
create or replace function public.aanvraag_melden(p_code text, p_reden text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare a private.aanvragen := private.aanvraag_via_code(p_code);
begin
  if a.id is null then return jsonb_build_object('fout', 'Deze link werkt niet (meer).'); end if;
  if trim(coalesce(p_reden, '')) = '' then return jsonb_build_object('fout', 'Schrijf kort wat er mis is.'); end if;
  update private.aanvragen set gemeld = left(trim(p_reden), 500) where id = a.id;
  return jsonb_build_object('ok', true);
end; $$;

-- Beheerder: cijfers, veelgevraagde plekken (om uit te nodigen), meldingen en de afmeldlijst.
create or replace function public.beheer_aanvragen(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is distinct from 1 then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object(
    'per_status', coalesce((select jsonb_object_agg(status, n) from (
       select status, count(*) as n from private.aanvragen where aangemaakt > now() - interval '30 days'
       group by status) s), '{}'::jsonb),
    'plekken', coalesce((select jsonb_agg(p order by (p ->> 'aantal')::int desc) from (
       select jsonb_build_object('plek', max(plek), 'adres', max(plek_adres), 'email', max(email),
         'telefoon', max(telefoon), 'aantal', count(*), 'bevestigd', count(*) filter (where status = 'bevestigd'),
         'interesse', bool_or(interesse), 'gestopt', private.aanvraag_gestopt(plek_sleutel, max(email)),
         'laatst', max(aangemaakt)) as p
       from private.aanvragen group by plek_sleutel
       order by bool_or(interesse) desc, count(*) desc limit 25) x), '[]'::jsonb),
    'meldingen', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'plek', a.plek, 'gast', private.weergave(a.gast),
         'gast_id', a.gast, 'reden', a.gemeld, 'start', a.start,
         'aanvragen_gast', (select count(*) from private.aanvragen x where x.gast = a.gast)) order by a.gewijzigd desc)
       from private.aanvragen a where a.gemeld <> ''), '[]'::jsonb),
    'gestopt', (select count(*) from private.aanvraag_stop where aan));
end; $$;

create or replace function public.beheer_aanvraag_afhandelen(p_naam text, p_wachtwoord text, p_id bigint,
                                                             p_gast_blokkeren boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_gast bigint;
begin
  if v_id is distinct from 1 then return jsonb_build_object('geen_toegang', true); end if;
  update private.aanvragen set gemeld = '' where id = p_id returning gast into v_gast;
  if coalesce(p_gast_blokkeren, false) and v_gast is not null and v_gast <> 1 then
    update private.gebruikers set geblokkeerd = true where id = v_gast;
    update private.aanvragen set status = 'geannuleerd', gewijzigd = now()
    where gast = v_gast and status in ('aangevraagd', 'voorstel', 'bevestigd') and start > now();
  end if;
  return jsonb_build_object('ok', v_gast is not null);
end; $$;

revoke all on function private.aanvraag_via_code(text) from public, anon, authenticated;
revoke all on function private.aanvraag_json(private.aanvragen) from public, anon, authenticated;
revoke all on function private.aanvraag_gestopt(text, text) from public, anon, authenticated;
