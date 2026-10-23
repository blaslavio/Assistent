-- Sport en gezondheid koppelen: trainingen, stappen en slaap uit andere apps, alleen lezen.
--
-- Twee manieren:
-- 1. Inloggen bij de app zelf (Strava, Fitbit, Polar, Withings, Oura). De sleutels van die apps (client ID en secret)
--    zet de eigenaar één keer in; ze staan in private.gezondheid_apps en alleen de Edge Function `gezondheid`
--    (service-rol) leest ze. De toegangscodes per gebruiker staan in private.gezondheid_koppelingen en verlaten de
--    database alleen richting die functie. De app en de browser zien ze nooit.
-- 2. Een app die zelf gegevens kan versturen (zoals Health Auto Export voor Apple Gezondheid) stuurt ze naar een
--    persoonlijk adres met een geheime code. Van die code bewaren we alleen een hash; je kunt hem altijd intrekken.
--
-- Niets wordt gewist: ontkoppelen zet status = 'weg' en maakt de toegangscodes leeg.

create table if not exists private.gezondheid_apps (
  aanbieder text primary key check (aanbieder in ('strava', 'fitbit', 'polar', 'withings', 'oura')),
  client_id text not null default '',
  client_secret text not null default '',
  gewijzigd timestamptz not null default now()
);
alter table private.gezondheid_apps enable row level security;

create table if not exists private.gezondheid_koppelingen (
  id bigint generated always as identity primary key,
  gebruiker_id bigint not null references private.gebruikers(id),
  aanbieder text not null,
  status text not null default 'wacht' check (status in ('wacht', 'actief', 'verlopen', 'weg')),
  staat_hash text not null default '',     -- sha256 van de willekeurige code waarmee de app terugkomt
  verifier text not null default '',       -- PKCE, alleen tijdens het koppelen
  access_token text not null default '',
  refresh_token text not null default '',
  verloopt timestamptz,
  extern_id text not null default '',
  extern_naam text not null default '',
  laatst_opgehaald timestamptz,
  fout text not null default '',
  aangemaakt timestamptz not null default now()
);
create index if not exists gezondheid_koppelingen_gebruiker on private.gezondheid_koppelingen (gebruiker_id, aanbieder);
create index if not exists gezondheid_koppelingen_staat on private.gezondheid_koppelingen (staat_hash) where staat_hash <> '';
alter table private.gezondheid_koppelingen enable row level security;

create table if not exists private.gezondheid_inzendcodes (
  id bigint generated always as identity primary key,
  gebruiker_id bigint not null references private.gebruikers(id),
  code_hash text not null unique,
  weg boolean not null default false,
  laatst_gebruikt timestamptz,
  aangemaakt timestamptz not null default now()
);
alter table private.gezondheid_inzendcodes enable row level security;

create table if not exists private.gezondheid_inzendingen (
  id bigint generated always as identity primary key,
  gebruiker_id bigint not null references private.gebruikers(id),
  bron text not null default '',
  soort text not null check (soort in ('training', 'dag')),
  sleutel text not null,
  inhoud jsonb not null,
  weg boolean not null default false,
  ontvangen timestamptz not null default now(),
  unique (gebruiker_id, sleutel)
);
create index if not exists gezondheid_inzendingen_gebruiker on private.gezondheid_inzendingen (gebruiker_id, ontvangen);
alter table private.gezondheid_inzendingen enable row level security;

-- --- Voor de app (met naam en wachtwoord/sessie) ------------------------------------------------

-- Wat je mag zien: welke apps aan staan, je eigen koppelingen (zonder codes) en of je een inzendadres hebt.
create or replace function public.gezondheid_status(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object(
    'aan', coalesce((select jsonb_agg(aanbieder order by aanbieder) from private.gezondheid_apps
                     where client_id <> '' and client_secret <> ''), '[]'::jsonb),
    'koppelingen', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'aanbieder', k.aanbieder,
        'status', k.status, 'naam', k.extern_naam, 'laatst_opgehaald', k.laatst_opgehaald, 'fout', k.fout) order by k.id)
      from private.gezondheid_koppelingen k where k.gebruiker_id = v_id and k.status in ('actief', 'verlopen')), '[]'::jsonb),
    'inzendadres', exists (select 1 from private.gezondheid_inzendcodes where gebruiker_id = v_id and not weg),
    'eigenaar', v_id = 1,
    'ingesteld', case when v_id = 1 then coalesce((select jsonb_object_agg(aanbieder, client_id <> '' and client_secret <> '')
      from private.gezondheid_apps), '{}'::jsonb) end);
end; $$;

-- Alleen de eigenaar: client ID en secret van een gezondheidsapp. Leeg laten = niet wijzigen.
create or replace function public.gezondheid_app_instellen(p_naam text, p_wachtwoord text, p_aanbieder text,
                                                           p_client_id text, p_client_secret text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if v_id <> 1 then return jsonb_build_object('fout', 'Alleen de eigenaar kan dit instellen.'); end if;
  if p_aanbieder not in ('strava', 'fitbit', 'polar', 'withings', 'oura') then
    return jsonb_build_object('fout', 'Onbekende app.');
  end if;
  if length(coalesce(p_client_id, '')) > 200 or length(coalesce(p_client_secret, '')) > 300
     or coalesce(p_client_id, '') ~ '\s' or coalesce(p_client_secret, '') ~ '\s' then
    return jsonb_build_object('fout', 'Dit ziet er niet uit als een client ID of secret.');
  end if;
  insert into private.gezondheid_apps (aanbieder, client_id, client_secret)
  values (p_aanbieder, coalesce(p_client_id, ''), coalesce(p_client_secret, ''))
  on conflict (aanbieder) do update set
    client_id = coalesce(nullif(excluded.client_id, ''), private.gezondheid_apps.client_id),
    client_secret = coalesce(nullif(excluded.client_secret, ''), private.gezondheid_apps.client_secret),
    gewijzigd = now();
  return jsonb_build_object('ok', true);
end; $$;

-- Een nieuw inzendadres. De code zie je één keer; een eerder adres stopt meteen.
create or replace function public.gezondheid_inzendcode_maken(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_code text;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if (select count(*) from private.gezondheid_inzendcodes where gebruiker_id = v_id
      and aangemaakt > now() - interval '1 day') >= 10 then
    return jsonb_build_object('fout', 'Je hebt vandaag al vaak een nieuw adres gemaakt.');
  end if;
  update private.gezondheid_inzendcodes set weg = true where gebruiker_id = v_id and not weg;
  v_code := encode(extensions.gen_random_bytes(24), 'hex');
  insert into private.gezondheid_inzendcodes (gebruiker_id, code_hash)
  values (v_id, encode(extensions.digest(v_code, 'sha256'), 'hex'));
  return jsonb_build_object('ok', true, 'code', v_code);
end; $$;

create or replace function public.gezondheid_inzendcode_stoppen(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  update private.gezondheid_inzendcodes set weg = true where gebruiker_id = v_id and not weg;
  return jsonb_build_object('ok', true);
end; $$;

-- Wat apps hebben ingestuurd sinds een moment (de app verwerkt het in je agenda en dagoverzicht).
create or replace function public.gezondheid_ingezonden(p_naam text, p_wachtwoord text, p_na timestamptz)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object('items', coalesce((select jsonb_agg(jsonb_build_object('soort', i.soort, 'bron', i.bron,
      'sleutel', i.sleutel, 'inhoud', i.inhoud, 'ontvangen', i.ontvangen) order by i.ontvangen)
    from (select * from private.gezondheid_inzendingen where gebruiker_id = v_id and not weg
            and ontvangen > coalesce(p_na, now() - interval '60 days') order by ontvangen limit 1000) i), '[]'::jsonb));
end; $$;

-- Je eigen geboekte afspraken en groepslessen bij anderen (bijv. een personal trainer of sportschool).
create or replace function public.mijn_trainingen(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object(
    'boekingen', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'soort', b.soort, 'start', b.start,
        'minuten', b.minuten, 'status', b.status, 'bij', private.weergave(b.gebruiker_id),
        'locatie', coalesce(p.locatie, '')) order by b.start)
      from private.boekingen b left join private.boekpaginas p on p.gebruiker_id = b.gebruiker_id
      where b.klant_id = v_id and b.status in ('aangevraagd', 'bevestigd') and b.start > now() - interval '2 hours'
        and b.start < now() + interval '60 days'), '[]'::jsonb),
    'lessen', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'naam', l.naam, 'start', l.start,
        'minuten', l.minuten, 'status', d.status, 'bij', private.weergave(l.gebruiker_id), 'locatie', l.locatie)
        order by l.start)
      from private.les_deelnemers d join private.lessen l on l.id = d.les_id
      where d.klant_id = v_id and d.status in ('ingeschreven', 'wachtlijst') and not l.weg
        and l.start > now() - interval '2 hours' and l.start < now() + interval '60 days'), '[]'::jsonb));
end; $$;

-- --- Alleen voor de Edge Function `gezondheid` (service-rol) ------------------------------------

create or replace function public.gezondheid_platform(p_aanbieder text)
returns jsonb language sql security definer set search_path to '' as $$
  select jsonb_build_object('client_id', a.client_id, 'client_secret', a.client_secret,
                            'app_adres', (select app_adres from private.platform where id = 1))
  from private.gezondheid_apps a where a.aanbieder = p_aanbieder and a.client_id <> '' and a.client_secret <> ''
$$;

create or replace function public.gezondheid_starten(p_gebruiker bigint, p_aanbieder text, p_staat_hash text,
                                                     p_verifier text)
returns boolean language plpgsql security definer set search_path to '' as $$
begin
  if (select count(*) from private.gezondheid_koppelingen where gebruiker_id = p_gebruiker
      and aangemaakt > now() - interval '1 hour') >= 20 then
    return false;
  end if;
  update private.gezondheid_koppelingen set status = 'weg', staat_hash = '', verifier = ''
  where gebruiker_id = p_gebruiker and status = 'wacht' and aangemaakt < now() - interval '15 minutes';
  insert into private.gezondheid_koppelingen (gebruiker_id, aanbieder, staat_hash, verifier)
  values (p_gebruiker, p_aanbieder, p_staat_hash, p_verifier);
  return true;
end; $$;

-- De poging met deze staat (van deze gebruiker, binnen 15 minuten). Eenmalig: de staat wordt meteen leeg.
create or replace function public.gezondheid_poging(p_gebruiker bigint, p_staat_hash text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare k private.gezondheid_koppelingen;
begin
  update private.gezondheid_koppelingen set staat_hash = ''
  where gebruiker_id = p_gebruiker and staat_hash = p_staat_hash and p_staat_hash <> '' and status = 'wacht'
    and aangemaakt > now() - interval '15 minutes'
  returning * into k;
  if k.id is null then return null; end if;
  return jsonb_build_object('id', k.id, 'aanbieder', k.aanbieder, 'verifier', k.verifier);
end; $$;

-- Nieuwe of ververste toegangscodes. Bij een nieuwe koppeling stopt een eerdere met dezelfde app.
create or replace function public.gezondheid_tokens(p_gebruiker bigint, p_id bigint, p_access text, p_refresh text,
                                                    p_verloopt timestamptz, p_extern_id text, p_extern_naam text)
returns boolean language plpgsql security definer set search_path to '' as $$
declare k private.gezondheid_koppelingen;
begin
  select * into k from private.gezondheid_koppelingen where id = p_id and gebruiker_id = p_gebruiker and status <> 'weg';
  if k.id is null then return false; end if;
  if k.status = 'wacht' then
    update private.gezondheid_koppelingen set status = 'weg', access_token = '', refresh_token = ''
    where gebruiker_id = p_gebruiker and aanbieder = k.aanbieder and id <> k.id and status <> 'weg';
  end if;
  update private.gezondheid_koppelingen set status = 'actief', verifier = '', access_token = p_access,
    refresh_token = coalesce(nullif(p_refresh, ''), refresh_token), verloopt = p_verloopt, fout = '',
    extern_id = coalesce(nullif(left(p_extern_id, 100), ''), extern_id),
    extern_naam = coalesce(nullif(left(p_extern_naam, 100), ''), extern_naam)
  where id = k.id;
  return true;
end; $$;

create or replace function public.gezondheid_koppeling(p_gebruiker bigint, p_aanbieder text)
returns jsonb language sql security definer set search_path to '' as $$
  select jsonb_build_object('id', id, 'aanbieder', aanbieder, 'access_token', access_token,
                            'refresh_token', refresh_token, 'verloopt', verloopt, 'extern_id', extern_id,
                            'status', status)
  from private.gezondheid_koppelingen where gebruiker_id = p_gebruiker and aanbieder = p_aanbieder
    and status in ('actief', 'verlopen') order by id desc limit 1
$$;

create or replace function public.gezondheid_bijwerken(p_gebruiker bigint, p_id bigint, p_status text, p_fout text,
                                                       p_opgehaald boolean)
returns boolean language plpgsql security definer set search_path to '' as $$
begin
  update private.gezondheid_koppelingen set
    status = coalesce(nullif(p_status, ''), status),
    fout = coalesce(left(p_fout, 300), fout),
    laatst_opgehaald = case when p_opgehaald then now() else laatst_opgehaald end,
    access_token = case when p_status = 'weg' then '' else access_token end,
    refresh_token = case when p_status = 'weg' then '' else refresh_token end,
    verifier = case when p_status = 'weg' then '' else verifier end
  where id = p_id and gebruiker_id = p_gebruiker;
  return found;
end; $$;

-- Een app stuurt gegevens in met de geheime code. Hooguit 60 keer per uur en 500 regels per keer.
create or replace function public.gezondheid_inzenden(p_code text, p_bron text, p_items jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare c private.gezondheid_inzendcodes; v_item jsonb; v_aantal int := 0;
begin
  select * into c from private.gezondheid_inzendcodes
  where code_hash = encode(extensions.digest(coalesce(p_code, ''), 'sha256'), 'hex') and not weg;
  if c.id is null or exists (select 1 from private.gebruikers where id = c.gebruiker_id and (verwijderd or geblokkeerd)) then
    return jsonb_build_object('fout', 'Onbekend adres.');
  end if;
  if (select count(*) from private.gezondheid_inzendingen where gebruiker_id = c.gebruiker_id
      and ontvangen > now() - interval '1 hour') >= 3000 then
    return jsonb_build_object('fout', 'Te veel tegelijk. Probeer het later opnieuw.');
  end if;
  update private.gezondheid_inzendcodes set laatst_gebruikt = now() where id = c.id;
  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) limit 500 loop
    continue when coalesce(v_item ->> 'soort', '') not in ('training', 'dag') or coalesce(v_item ->> 'sleutel', '') = ''
      or pg_column_size(v_item) > 4000;
    insert into private.gezondheid_inzendingen (gebruiker_id, bron, soort, sleutel, inhoud)
    values (c.gebruiker_id, left(coalesce(p_bron, ''), 40), v_item ->> 'soort', left(v_item ->> 'sleutel', 120),
            coalesce(v_item -> 'inhoud', '{}'::jsonb))
    on conflict (gebruiker_id, sleutel) do update
      set inhoud = private.gezondheid_inzendingen.inhoud || excluded.inhoud, ontvangen = now(), weg = false;
    v_aantal := v_aantal + 1;
  end loop;
  return jsonb_build_object('ok', true, 'aantal', v_aantal);
end; $$;

-- Wie zijn account verwijdert: alle koppelingen stoppen, codes leeg, ingezonden gegevens weg (zacht).
create or replace function private.gezondheid_opruimen()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.verwijderd and not old.verwijderd then
    update private.gezondheid_koppelingen set status = 'weg', access_token = '', refresh_token = '', verifier = '',
      staat_hash = '', extern_naam = '' where gebruiker_id = new.id;
    update private.gezondheid_inzendcodes set weg = true where gebruiker_id = new.id;
    update private.gezondheid_inzendingen set weg = true, inhoud = '{}'::jsonb where gebruiker_id = new.id;
  end if;
  return new;
end; $$;

create or replace trigger gezondheid_opruimen after update of verwijderd on private.gebruikers
  for each row execute function private.gezondheid_opruimen();

-- --- Rechten --------------------------------------------------------------------------------

revoke all on function private.gezondheid_opruimen() from public, anon, authenticated;
revoke all on function public.gezondheid_platform(text), public.gezondheid_starten(bigint, text, text, text),
  public.gezondheid_poging(bigint, text),
  public.gezondheid_tokens(bigint, bigint, text, text, timestamptz, text, text),
  public.gezondheid_koppeling(bigint, text), public.gezondheid_bijwerken(bigint, bigint, text, text, boolean),
  public.gezondheid_inzenden(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.gezondheid_platform(text), public.gezondheid_starten(bigint, text, text, text),
  public.gezondheid_poging(bigint, text),
  public.gezondheid_tokens(bigint, bigint, text, text, timestamptz, text, text),
  public.gezondheid_koppeling(bigint, text), public.gezondheid_bijwerken(bigint, bigint, text, text, boolean),
  public.gezondheid_inzenden(text, text, jsonb) to service_role;
