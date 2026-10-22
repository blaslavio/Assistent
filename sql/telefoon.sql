-- Inloggen en gevonden worden met je telefoonnummer.
--
-- Het nummer staat nergens leesbaar in de database: alleen een sleutel-hash (HMAC-SHA256 met een geheime sleutel die
-- alleen de database kent) en de laatste twee cijfers, zodat je in de app ziet welk nummer je gebruikt. Daardoor kan
-- niemand met een kopie van de gegevens de nummers terugrekenen, en zoeken kan alleen op het hele, exacte nummer.
-- Anderen vinden je alleen op je nummer als je dat zelf aanzet (standaard uit). Zoeken op nummer is beperkt tot
-- 20 keer per uur, zodat niemand lijsten met nummers kan afgaan.

create extension if not exists pgcrypto with schema extensions;

alter table private.platform add column if not exists telefoon_sleutel text not null
  default encode(extensions.gen_random_bytes(32), 'hex');
insert into private.platform (id) values (1) on conflict (id) do nothing;

alter table private.gebruikers add column if not exists telefoon_hash text;
alter table private.gebruikers add column if not exists telefoon_eind text;
alter table private.gebruikers add column if not exists telefoon_vindbaar boolean not null default false;
create unique index if not exists gebruikers_telefoon_uniek on private.gebruikers (telefoon_hash)
  where telefoon_hash is not null;

create table if not exists private.telefoon_zoeken (
  id bigserial primary key,
  gebruiker bigint not null,
  tijd timestamptz not null default now()
);
create index if not exists telefoon_zoeken_wie on private.telefoon_zoeken (gebruiker, tijd);
alter table private.telefoon_zoeken enable row level security;
revoke all on private.telefoon_zoeken from public, anon, authenticated;

-- 06 12345678, +31 6-1234 5678, 0031612345678 en 612345678 worden allemaal +31612345678. Zonder landcode geldt +31.
create or replace function private.telefoon_normaal(p text)
returns text language plpgsql immutable set search_path to '' as $$
declare v text := regexp_replace(coalesce(p, ''), '[[:space:]().-]', '', 'g');
begin
  if v !~ '^\+?[0-9]{8,16}$' then return null; end if;
  if v like '00%' then v := '+' || substr(v, 3);
  elsif v like '+%' then null;
  elsif v like '0%' then v := '+31' || substr(v, 2);
  elsif v ~ '^6[0-9]{8}$' then v := '+31' || v;
  else return null;
  end if;
  if v !~ '^\+[1-9][0-9]{7,14}$' then return null; end if;
  return v;
end; $$;

create or replace function private.telefoon_hash(p text)
returns text language sql stable security definer set search_path to '' as $$
  select case when private.telefoon_normaal(p) is null then null else
    encode(extensions.hmac(private.telefoon_normaal(p), (select telefoon_sleutel from private.platform where id = 1),
                           'sha256'), 'hex') end
$$;
revoke all on function private.telefoon_normaal(text), private.telefoon_hash(text) from public, anon, authenticated;

-- Welk account hoort bij wat iemand bij het inloggen intypt: leeg (eigenaar), mailadres, gebruikersnaam of nummer.
create or replace function private.account_bij(p_naam text)
returns bigint language plpgsql stable security definer set search_path to '' as $$
declare v_naam text := nullif(lower(trim(coalesce(p_naam, ''))), ''); v_id bigint;
begin
  if v_naam is null then return 1; end if;
  if v_naam like '%@%' then
    select id into v_id from private.gebruikers where lower(email) = v_naam and email is not null;
    return v_id;
  end if;
  select id into v_id from private.gebruikers where naam = v_naam;
  if v_id is null and private.telefoon_normaal(v_naam) is not null then
    select id into v_id from private.gebruikers where telefoon_hash = private.telefoon_hash(v_naam);
  end if;
  return v_id;
end; $$;
revoke all on function private.account_bij(text) from public, anon, authenticated;

create or replace function private.met_wachtwoord(p_naam text, p_wachtwoord text)
returns bigint language plpgsql stable security definer set search_path to '' as $$
declare g private.gebruikers;
begin
  select * into g from private.gebruikers where id = private.account_bij(p_naam);
  if g.id is null or g.geblokkeerd or g.verwijderd then return null; end if;
  if g.hash = extensions.crypt(coalesce(p_wachtwoord, ''), g.hash) then return g.id; end if;
  return null;
end; $$;

create or replace function public.inloggen(p_naam text, p_wachtwoord text, p_code text, p_apparaat text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_naam text := nullif(lower(trim(coalesce(p_naam, ''))), '');
  v_id bigint;
begin
  -- Een nummer telt in elke schrijfwijze als hetzelfde, ook voor het maximum aantal pogingen.
  if v_naam is not null and v_naam not like '%@%' and private.telefoon_normaal(v_naam) is not null
     and not exists (select 1 from private.gebruikers where naam = v_naam) then
    v_naam := private.telefoon_normaal(v_naam);
  end if;
  if private.te_veel_pogingen(v_naam) then
    return jsonb_build_object('fout', 'Te veel pogingen. Wacht een kwartier en probeer het opnieuw.');
  end if;
  v_id := private.met_wachtwoord(v_naam, p_wachtwoord);
  if v_id is null then
    insert into private.pogingen (naam) values (v_naam);
    insert into private.inlogs (gebruiker, apparaat, gelukt, reden)
    select id, left(p_apparaat, 80), false, 'wachtwoord' from private.gebruikers where id = private.account_bij(v_naam);
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

create or replace function public.telefoon_instellen(p_naam text, p_wachtwoord text, p_telefoon text, p_vindbaar boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_hash text;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if coalesce(trim(p_telefoon), '') = '' then
    update private.gebruikers set telefoon_hash = null, telefoon_eind = null, telefoon_vindbaar = false where id = v_id;
    return jsonb_build_object('ok', true);
  end if;
  if p_telefoon = '-' then  -- alleen vindbaar aan of uit, nummer blijft
    update private.gebruikers set telefoon_vindbaar = coalesce(p_vindbaar, false) and telefoon_hash is not null
    where id = v_id;
    return jsonb_build_object('ok', true);
  end if;
  v_hash := private.telefoon_hash(p_telefoon);
  if v_hash is null then
    return jsonb_build_object('fout', 'Dit nummer klopt niet. Schrijf het bijvoorbeeld als 06 12345678 of +32 470 12 34 56.');
  end if;
  if exists (select 1 from private.gebruikers where telefoon_hash = v_hash and id <> v_id) then
    return jsonb_build_object('fout', 'Dit nummer hoort al bij een ander account.');
  end if;
  update private.gebruikers set telefoon_hash = v_hash, telefoon_eind = right(private.telefoon_normaal(p_telefoon), 2),
         telefoon_vindbaar = coalesce(p_vindbaar, false)
  where id = v_id;
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.telefoon_instellen(text, text, text, boolean) to anon, authenticated;

create or replace function public.mijn_gegevens(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object(
    'data', (select data from public.gegevens where id = v_id),
    'gebruiker', (select jsonb_build_object('id', id, 'naam', naam, 'weergavenaam', private.weergave(id),
                                            'email', email, 'email_bevestigd', email_bevestigd, 'beheerder', id = 1,
                                            'niveau', niveau, 'bedrijf', bedrijf, 'max_aanbod', private.max_aanbod(id),
                                            'telefoon_eind', telefoon_eind, 'telefoon_vindbaar', telefoon_vindbaar)
                  from private.gebruikers where id = v_id));
end; $$;

-- Iemand toevoegen op gebruikersnaam, of op telefoonnummer als die persoon vindbaar is op zijn nummer.
create or replace function public.chat_contact_toevoegen(p_naam text, p_wachtwoord text, p_wie text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_ander bigint;
  v_wie text := lower(trim(both '@ ' from coalesce(p_wie, '')));
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select id into v_ander from private.gebruikers where naam = v_wie and not verwijderd and not geblokkeerd;
  if v_ander is null and private.telefoon_normaal(v_wie) is not null then
    if (select count(*) from private.telefoon_zoeken where gebruiker = v_id and tijd > now() - interval '1 hour') >= 20 then
      return jsonb_build_object('fout', 'Je hebt het afgelopen uur al veel nummers gezocht. Probeer het later opnieuw.');
    end if;
    insert into private.telefoon_zoeken (gebruiker) values (v_id);
    select id into v_ander from private.gebruikers
    where telefoon_hash = private.telefoon_hash(v_wie) and telefoon_vindbaar and not verwijderd and not geblokkeerd;
    if v_ander is null then
      return jsonb_build_object('fout', 'Niemand gevonden met dit nummer. Misschien staat vindbaar op nummer bij die persoon uit.');
    end if;
  end if;
  if v_ander is null then return jsonb_build_object('fout', 'Geen gebruiker met die naam.'); end if;
  if v_ander = v_id then return jsonb_build_object('fout', 'Dat ben je zelf.'); end if;
  if (select count(*) from private.chat_contacten where gebruiker = v_id and not weg) >= 2000 then
    return jsonb_build_object('fout', 'Je hebt al heel veel contacten.');
  end if;
  perform private.chat_contact_zetten(v_id, v_ander);
  return jsonb_build_object('ok', true, 'id', v_ander, 'naam', private.weergave(v_ander),
                            'chat', private.chat_heeft_apparaat(v_ander));
end; $$;

-- Een verwijderd account houdt geen nummer.
create or replace function private.telefoon_bij_verwijderen()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.verwijderd and not old.verwijderd then
    new.telefoon_hash := null; new.telefoon_eind := null; new.telefoon_vindbaar := false;
  end if;
  return new;
end; $$;
create or replace trigger telefoon_bij_verwijderen before update of verwijderd on private.gebruikers
  for each row execute function private.telefoon_bij_verwijderen();
