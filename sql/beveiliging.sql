-- Beter beveiligd inloggen: tweestapsverificatie (codes uit een app zoals Wachtwoorden of Google Authenticator),
-- herstelcodes, sessies in plaats van het wachtwoord bij elke vraag, een overzicht van inlogs en
-- "overal uitloggen".
--
-- Na inloggen krijgt de app een sessiecode ("sessie.<64 tekens>") die in plaats van het wachtwoord wordt
-- meegestuurd. Staat tweestapsverificatie aan, dan werkt het wachtwoord alleen nog samen met een code;
-- de database dwingt dat af, niet alleen de app.

alter table private.gebruikers add column if not exists totp_geheim text;
alter table private.gebruikers add column if not exists totp_aan boolean not null default false;
alter table private.gebruikers add column if not exists totp_laatste bigint;

create table if not exists private.sessies (
  id bigserial primary key,
  gebruiker bigint not null references private.gebruikers (id),
  token_hash text not null unique,
  apparaat text,
  aangemaakt timestamptz not null default now(),
  laatst timestamptz not null default now(),
  verloopt timestamptz not null
);
create index if not exists sessies_gebruiker on private.sessies (gebruiker);

create table if not exists private.inlogs (
  id bigserial primary key,
  gebruiker bigint not null references private.gebruikers (id),
  tijd timestamptz not null default now(),
  apparaat text,
  gelukt boolean not null,
  reden text
);
create index if not exists inlogs_gebruiker on private.inlogs (gebruiker, tijd desc);

create table if not exists private.herstelcodes (
  id bigserial primary key,
  gebruiker bigint not null references private.gebruikers (id),
  code_hash text not null,
  gebruikt_op timestamptz
);

alter table private.sessies enable row level security;
alter table private.inlogs enable row level security;
alter table private.herstelcodes enable row level security;

-- --- Hulpfuncties ------------------------------------------------------------------------

create or replace function private.hash(p_tekst text)
returns text language sql immutable set search_path to '' as $$
  select encode(extensions.digest(p_tekst, 'sha256'), 'hex')
$$;

-- Zoekt een gebruiker op naam (leeg = eigenaar), gebruikersnaam of mailadres met wachtwoord. Zonder bijwerkingen.
create or replace function private.met_wachtwoord(p_naam text, p_wachtwoord text)
returns bigint language sql stable security definer set search_path to '' as $$
  select id from private.gebruikers
  where (case when nullif(lower(trim(coalesce(p_naam, ''))), '') is null then id = 1
              when lower(trim(p_naam)) like '%@%' then lower(email) = lower(trim(p_naam))
              else naam = lower(trim(p_naam)) end)
    and not geblokkeerd and not verwijderd
    and hash = extensions.crypt(coalesce(p_wachtwoord, ''), hash)
$$;

create or replace function private.te_veel_pogingen(p_naam text)
returns boolean language sql stable security definer set search_path to '' as $$
  select (select count(*) from private.pogingen
          where tijd > now() - interval '15 minutes'
            and coalesce(naam, '') = coalesce(nullif(lower(trim(coalesce(p_naam, ''))), ''), '')) >= 10
$$;

-- TOTP (RFC 6238): 6 cijfers, elke 30 seconden een nieuwe code.
create or replace function private.totp(p_geheim_hex text, p_stap bigint)
returns text language plpgsql immutable set search_path to '' as $$
declare
  h bytea := extensions.hmac(int8send(p_stap), decode(p_geheim_hex, 'hex'), 'sha1');
  o int := get_byte(h, 19) & 15;
begin
  -- Haakjes zijn nodig: in Postgres hebben << en | dezelfde voorrang.
  return lpad(((((get_byte(h, o) & 127)::bigint << 24) | (get_byte(h, o + 1) << 16) | (get_byte(h, o + 2) << 8)
                | get_byte(h, o + 3)) % 1000000)::text, 6, '0');
end; $$;

-- Controleert een code (ook 30 seconden ervoor of erna) en voorkomt dat dezelfde code twee keer werkt.
create or replace function private.code_klopt(p_id bigint, p_code text)
returns boolean language plpgsql security definer set search_path to '' as $$
declare
  g private.gebruikers;
  v_code text := regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g');
  v_nu bigint := floor(extract(epoch from now()) / 30);
  v_stap bigint;
begin
  select * into g from private.gebruikers where id = p_id;
  if g.totp_geheim is null then return false; end if;
  if length(v_code) = 6 and v_code ~ '^[0-9]+$' then
    for v_stap in v_nu - 1 .. v_nu + 1 loop
      if v_stap > coalesce(g.totp_laatste, 0) and private.totp(g.totp_geheim, v_stap) = v_code then
        update private.gebruikers set totp_laatste = v_stap where id = p_id;
        return true;
      end if;
    end loop;
    return false;
  end if;
  -- Herstelcode (eenmalig te gebruiken).
  update private.herstelcodes set gebruikt_op = now()
  where id = (select id from private.herstelcodes
              where gebruiker = p_id and gebruikt_op is null and code_hash = private.hash(lower(v_code)) limit 1);
  return found;
end; $$;

create or replace function private.nieuwe_sessie(p_id bigint, p_apparaat text)
returns text language plpgsql security definer set search_path to '' as $$
declare v_token text := 'sessie.' || encode(extensions.gen_random_bytes(32), 'hex');
begin
  insert into private.sessies (gebruiker, token_hash, apparaat, verloopt)
  values (p_id, private.hash(v_token), left(p_apparaat, 80), now() + interval '12 hours');
  return v_token;
end; $$;

-- Iedere functie gebruikt deze controle. Met een sessiecode: geldig en niet verlopen. Met een wachtwoord:
-- alleen als tweestapsverificatie uit staat (oude sessies en accounts zonder tweestapsverificatie).
create or replace function private.gebruiker_id(p_naam text, p_wachtwoord text)
returns bigint language plpgsql security definer set search_path to '' as $$
declare
  v_naam text := nullif(lower(trim(coalesce(p_naam, ''))), '');
  v_id bigint;
  v_sessie private.sessies;
begin
  if coalesce(p_wachtwoord, '') like 'sessie.%' then
    select s.* into v_sessie from private.sessies s join private.gebruikers g on g.id = s.gebruiker
    where s.token_hash = private.hash(p_wachtwoord) and s.verloopt > now() and not g.geblokkeerd and not g.verwijderd;
    if v_sessie.id is null then return null; end if;
    if v_sessie.laatst < now() - interval '5 minutes' then
      -- Zolang je de app gebruikt, blijf je ingelogd; hooguit 30 dagen.
      update private.sessies set laatst = now(),
        verloopt = least(greatest(verloopt, now() + interval '12 hours'), aangemaakt + interval '30 days')
      where id = v_sessie.id;
    end if;
    return v_sessie.gebruiker;
  end if;
  if private.te_veel_pogingen(v_naam) then return null; end if;
  v_id := private.met_wachtwoord(v_naam, p_wachtwoord);
  if v_id is null then
    insert into private.pogingen (naam) values (v_naam);
    return null;
  end if;
  if (select totp_aan from private.gebruikers where id = v_id) then return null; end if;
  return v_id;
end; $$;

-- --- Voor de app ------------------------------------------------------------------------

-- Inloggen: wachtwoord en (als het aan staat) een code. Geeft een sessiecode.
create or replace function public.inloggen(p_naam text, p_wachtwoord text, p_code text, p_apparaat text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_naam text := nullif(lower(trim(coalesce(p_naam, ''))), '');
  v_id bigint;
begin
  if private.te_veel_pogingen(v_naam) then
    return jsonb_build_object('fout', 'Te veel pogingen. Wacht een kwartier en probeer het opnieuw.');
  end if;
  v_id := private.met_wachtwoord(v_naam, p_wachtwoord);
  if v_id is null then
    insert into private.pogingen (naam) values (v_naam);
    insert into private.inlogs (gebruiker, apparaat, gelukt, reden)
    select id, left(p_apparaat, 80), false, 'wachtwoord' from private.gebruikers
    where (case when v_naam is null then id = 1 when v_naam like '%@%' then lower(email) = v_naam else naam = v_naam end);
    return jsonb_build_object('fout', 'Gebruikersnaam of wachtwoord klopt niet. Na 10 foute pogingen moet je een kwartier wachten.');
  end if;
  if (select totp_aan from private.gebruikers where id = v_id) then
    if coalesce(p_code, '') = '' then
      return jsonb_build_object('code_nodig', true);
    end if;
    if not private.code_klopt(v_id, p_code) then
      insert into private.pogingen (naam) values (v_naam);
      insert into private.inlogs (gebruiker, apparaat, gelukt, reden) values (v_id, left(p_apparaat, 80), false, 'code');
      return jsonb_build_object('code_nodig', true, 'fout', 'Deze code klopt niet. Gebruik de nieuwste code uit je app.');
    end if;
  end if;
  insert into private.inlogs (gebruiker, apparaat, gelukt) values (v_id, left(p_apparaat, 80), true);
  return jsonb_build_object('token', private.nieuwe_sessie(v_id, p_apparaat));
end; $$;

create or replace function public.uitloggen(p_naam text, p_wachtwoord text)
returns jsonb language sql security definer set search_path to '' as $$
  update private.sessies set verloopt = now()
  where token_hash = private.hash(coalesce(p_wachtwoord, '')) and verloopt > now();
  select jsonb_build_object('ok', true)
$$;

create or replace function public.beveiliging(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object(
    'twee_stap', (select totp_aan from private.gebruikers where id = v_id),
    'herstelcodes_over', (select count(*) from private.herstelcodes where gebruiker = v_id and gebruikt_op is null),
    'sessies', coalesce((select jsonb_agg(jsonb_build_object(
        'apparaat', apparaat, 'aangemaakt', aangemaakt, 'laatst', laatst,
        'deze', token_hash = private.hash(coalesce(p_wachtwoord, ''))) order by laatst desc)
      from private.sessies where gebruiker = v_id and verloopt > now()), '[]'::jsonb),
    'inlogs', coalesce((select jsonb_agg(i order by i.tijd desc) from (
        select tijd, apparaat, gelukt, reden from private.inlogs where gebruiker = v_id order by tijd desc limit 15) i),
      '[]'::jsonb),
    'mislukt_recent', (select count(*) from private.inlogs
                       where gebruiker = v_id and not gelukt and tijd > now() - interval '7 days'
                         and tijd < now() - interval '10 minutes'  -- eigen typfouten van zojuist tellen niet
                         and tijd > coalesce((select max(tijd) from private.inlogs
                                              where gebruiker = v_id and gelukt and tijd < now() - interval '1 minute'),
                                             '-infinity')));
end; $$;

-- Alle andere apparaten uitloggen (deze sessie blijft).
create or replace function public.overal_uitloggen(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  update private.sessies set verloopt = now()
  where gebruiker = v_id and verloopt > now() and token_hash <> private.hash(coalesce(p_wachtwoord, ''));
  return jsonb_build_object('ok', true);
end; $$;

-- Stap 1: een nieuw geheim maken (nog niet aan). Geeft het geheim (hex) voor de QR-code.
create or replace function public.twee_stap_starten(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
  v_geheim text := encode(extensions.gen_random_bytes(20), 'hex');
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if (select totp_aan from private.gebruikers where id = v_id) then
    return jsonb_build_object('fout', 'Tweestapsverificatie staat al aan.');
  end if;
  update private.gebruikers set totp_geheim = v_geheim, totp_laatste = null where id = v_id;
  return jsonb_build_object('geheim', v_geheim);
end; $$;

-- Stap 2: met een code bevestigen dat de app werkt. Zet het aan en geeft eenmalig 8 herstelcodes.
create or replace function public.twee_stap_bevestigen(p_naam text, p_wachtwoord text, p_code text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
  v_codes text[] := '{}';
  v_code text;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if (select totp_aan or totp_geheim is null from private.gebruikers where id = v_id) then
    return jsonb_build_object('fout', 'Begin opnieuw met instellen.');
  end if;
  if coalesce(p_code, '') !~ '^\s*[0-9]{3}\s*[0-9]{3}\s*$' or not private.code_klopt(v_id, p_code) then
    return jsonb_build_object('fout', 'Deze code klopt niet. Controleer of de tijd op je telefoon klopt en probeer de nieuwste code.');
  end if;
  update private.herstelcodes set gebruikt_op = now() where gebruiker = v_id and gebruikt_op is null;
  for i in 1..8 loop
    v_code := substr(encode(extensions.gen_random_bytes(5), 'hex'), 1, 5) || '-' ||
              substr(encode(extensions.gen_random_bytes(5), 'hex'), 1, 5);
    v_codes := v_codes || v_code;
    insert into private.herstelcodes (gebruiker, code_hash) values (v_id, private.hash(replace(v_code, '-', '')));
  end loop;
  update private.gebruikers set totp_aan = true where id = v_id;
  -- Wie alleen het wachtwoord had, is er nu uit; deze sessie blijft.
  update private.sessies set verloopt = now()
  where gebruiker = v_id and verloopt > now() and token_hash <> private.hash(coalesce(p_wachtwoord, ''));
  return jsonb_build_object('herstelcodes', to_jsonb(v_codes));
end; $$;

-- Uitzetten kan alleen met het wachtwoord én een code (of herstelcode).
create or replace function public.twee_stap_uitzetten(p_naam text, p_wachtwoord text, p_huidig_wachtwoord text,
                                                      p_code text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if not exists (select 1 from private.gebruikers
                 where id = v_id and hash = extensions.crypt(coalesce(p_huidig_wachtwoord, ''), hash)) then
    return jsonb_build_object('fout', 'Je wachtwoord klopt niet.');
  end if;
  if not private.code_klopt(v_id, p_code) then
    return jsonb_build_object('fout', 'Deze code klopt niet.');
  end if;
  update private.gebruikers set totp_aan = false, totp_geheim = null, totp_laatste = null where id = v_id;
  update private.herstelcodes set gebruikt_op = now() where gebruiker = v_id and gebruikt_op is null;
  return jsonb_build_object('ok', true);
end; $$;

-- Na een nieuw wachtwoord worden andere apparaten uitgelogd.
create or replace function public.profiel_bijwerken(p_naam text, p_wachtwoord text, p_nieuwe_naam text,
                                                    p_weergavenaam text, p_nieuw_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
  v_naam text := nullif(lower(trim(coalesce(p_nieuwe_naam, ''))), '');
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if v_naam is not null then
    if v_naam !~ '^[a-z0-9_.-]{3,30}$' then
      return jsonb_build_object('fout', 'Gebruikersnaam: 3 tot 30 tekens, kleine letters, cijfers, punt of streepje.');
    end if;
    if exists (select 1 from private.gebruikers where naam = v_naam and id <> v_id) then
      return jsonb_build_object('fout', 'Deze gebruikersnaam is al bezet.');
    end if;
    update private.gebruikers set naam = v_naam where id = v_id;
  end if;
  if p_weergavenaam is not null then
    update private.gebruikers set weergavenaam = left(trim(p_weergavenaam), 60) where id = v_id;
  end if;
  if coalesce(p_nieuw_wachtwoord, '') <> '' then
    if length(p_nieuw_wachtwoord) < 10 then
      return jsonb_build_object('fout', 'Kies een wachtwoord van minstens 10 tekens.');
    end if;
    update private.gebruikers set hash = extensions.crypt(p_nieuw_wachtwoord, extensions.gen_salt('bf', 10))
    where id = v_id;
    update private.sessies set verloopt = now()
    where gebruiker = v_id and verloopt > now() and token_hash <> private.hash(coalesce(p_wachtwoord, ''));
  end if;
  return jsonb_build_object('ok', true);
end; $$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke all on private.sessies, private.inlogs, private.herstelcodes from public, anon, authenticated;
grant execute on function public.inloggen(text, text, text, text), public.uitloggen(text, text),
  public.beveiliging(text, text), public.overal_uitloggen(text, text), public.twee_stap_starten(text, text),
  public.twee_stap_bevestigen(text, text, text), public.twee_stap_uitzetten(text, text, text, text)
  to anon, authenticated;
