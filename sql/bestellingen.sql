-- Mailadres bij registratie, betaalwijzen, bestellingen met kopersbescherming,
-- beoordelingen en extra controles tegen nepaccounts.

-- --- Mailadres -----------------------------------------------------------------

alter table private.gebruikers add column if not exists email text;
alter table private.gebruikers add column if not exists email_bevestigd boolean not null default false;
create unique index if not exists gebruikers_email_uniek on private.gebruikers (lower(email)) where email is not null;

-- Inloggen kan nu met gebruikersnaam of mailadres. Lege naam = de eigenaar.
create or replace function private.gebruiker_id(p_naam text, p_wachtwoord text)
returns bigint language plpgsql security definer set search_path to '' as $$
declare
  v_naam text := nullif(lower(trim(coalesce(p_naam, ''))), '');
  v_id bigint;
begin
  if (select count(*) from private.pogingen
      where tijd > now() - interval '15 minutes' and coalesce(naam, '') = coalesce(v_naam, '')) >= 10 then
    return null;
  end if;
  select id into v_id from private.gebruikers
  where (case when v_naam is null then id = 1
              when v_naam like '%@%' then lower(email) = v_naam
              else naam = v_naam end)
    and not geblokkeerd and not verwijderd
    and hash = extensions.crypt(coalesce(p_wachtwoord, ''), hash);
  if v_id is null then
    insert into private.pogingen (naam) values (v_naam);
  end if;
  return v_id;
end; $$;

create or replace function private.email_ok(p_email text)
returns boolean language sql immutable set search_path to '' as $$
  select coalesce(p_email, '') ~* '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$'
$$;

-- Nieuwe versie met mailadres. De oude versie zonder mailadres werkt niet meer.
create or replace function public.account_maken(p_naam text, p_weergavenaam text, p_wachtwoord text, p_akkoord boolean)
returns jsonb language sql security definer set search_path to '' as $$
  select jsonb_build_object('fout', 'Vul ook je mailadres in. Ververs de pagina als je dat veld niet ziet.')
$$;

create or replace function public.account_maken(p_naam text, p_weergavenaam text, p_email text, p_wachtwoord text,
                                                 p_akkoord boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_naam text := lower(trim(coalesce(p_naam, '')));
  v_email text := lower(trim(coalesce(p_email, '')));
  v_id bigint;
begin
  if not coalesce(p_akkoord, false) then
    return jsonb_build_object('fout', 'Ga akkoord met de voorwaarden en de privacyverklaring.');
  end if;
  if v_naam !~ '^[a-z0-9_.-]{3,30}$' then
    return jsonb_build_object('fout', 'Kies een gebruikersnaam van 3 tot 30 tekens: kleine letters, cijfers, punt, streepje of laag streepje.');
  end if;
  if not private.email_ok(v_email) then
    return jsonb_build_object('fout', 'Vul een geldig mailadres in.');
  end if;
  if length(coalesce(p_wachtwoord, '')) < 10 then
    return jsonb_build_object('fout', 'Kies een wachtwoord van minstens 10 tekens.');
  end if;
  if (select count(*) from private.gebruikers where aangemaakt > now() - interval '1 hour') >= 30 then
    return jsonb_build_object('fout', 'Het is even te druk. Probeer het over een uur opnieuw.');
  end if;
  if exists (select 1 from private.gebruikers where naam = v_naam) then
    return jsonb_build_object('fout', 'Deze gebruikersnaam is al bezet.');
  end if;
  if exists (select 1 from private.gebruikers where lower(email) = v_email) then
    return jsonb_build_object('fout', 'Er is al een account met dit mailadres. Log in met je mailadres.');
  end if;
  insert into private.gebruikers (naam, weergavenaam, email, hash, akkoord_op)
  values (v_naam, left(trim(coalesce(p_weergavenaam, '')), 60), v_email,
          extensions.crypt(p_wachtwoord, extensions.gen_salt('bf', 10)), now())
  returning id into v_id;
  insert into public.gegevens (id, data) values (v_id, '{}'::jsonb) on conflict (id) do nothing;
  return jsonb_build_object('ok', true, 'id', v_id);
end; $$;

create or replace function public.email_instellen(p_naam text, p_wachtwoord text, p_email text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_email text := lower(trim(coalesce(p_email, '')));
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if not private.email_ok(v_email) then return jsonb_build_object('fout', 'Vul een geldig mailadres in.'); end if;
  if exists (select 1 from private.gebruikers where lower(email) = v_email and id <> v_id) then
    return jsonb_build_object('fout', 'Dit mailadres hoort al bij een ander account.');
  end if;
  update private.gebruikers set email = v_email,
         email_bevestigd = email_bevestigd and lower(coalesce(email, '')) = v_email
  where id = v_id;
  return jsonb_build_object('ok', true);
end; $$;

create or replace function public.mijn_gegevens(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object(
    'data', (select data from public.gegevens where id = v_id),
    'gebruiker', (select jsonb_build_object('id', id, 'naam', naam, 'weergavenaam', private.weergave(id),
                                            'email', email, 'email_bevestigd', email_bevestigd, 'beheerder', id = 1)
                  from private.gebruikers where id = v_id));
end; $$;

-- Bij verwijderen ook het mailadres wissen.
create or replace function public.account_verwijderen(p_naam text, p_wachtwoord text)
returns boolean language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null or v_id = 1 then return false; end if;
  if exists (select 1 from private.bestellingen where (koper = v_id or verkoper = v_id)
             and status in ('betaald', 'geleverd', 'geschil')) then
    return false;
  end if;
  update public.gegevens set data = '{}'::jsonb where id = v_id;
  update private.media set verwijderd = true, inhoud = ''::bytea where gebruiker_id = v_id;
  update private.aanbod set actief = false, omschrijving = '', contact = '' where gebruiker_id = v_id;
  update private.project_leden set actief = false where gebruiker_id = v_id;
  update private.gebruikers set verwijderd = true, naam = null, email = null, weergavenaam = 'Verwijderd account',
         hash = extensions.crypt(extensions.gen_random_uuid()::text, extensions.gen_salt('bf', 4))
  where id = v_id;
  return true;
end; $$;

-- --- Betaalwijzen en levering per aanbod ---------------------------------------------

alter table private.aanbod add column if not exists betaalwijzen text[] not null default '{tikkie,contant}';
alter table private.aanbod add column if not exists levering text[] not null default '{ophalen}';

create or replace function public.aanbod_plaatsen(p_naam text, p_wachtwoord text, p_soort text, p_titel text,
                                                  p_omschrijving text, p_prijs numeric, p_prijs_per text,
                                                  p_plaats text, p_contact text, p_betaalwijzen text[], p_levering text[])
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_aanbod bigint; v_nieuw boolean;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if p_soort not in ('product', 'dienst', 'training', 'les') then return jsonb_build_object('fout', 'Kies een soort.'); end if;
  if trim(coalesce(p_titel, '')) = '' then return jsonb_build_object('fout', 'Vul een titel in.'); end if;
  if v_id <> 1 and not exists (select 1 from private.gebruikers where id = v_id and email is not null) then
    return jsonb_build_object('fout', 'Vul eerst je mailadres in bij Instellingen › Account.');
  end if;
  if coalesce(array_length(p_betaalwijzen, 1), 0) = 0
     or not p_betaalwijzen <@ array['app', 'tikkie', 'contant', 'overmaken'] then
    return jsonb_build_object('fout', 'Kies hoe er betaald kan worden.');
  end if;
  if coalesce(array_length(p_levering, 1), 0) = 0
     or not p_levering <@ array['ophalen', 'verzenden', 'op_locatie', 'online'] then
    return jsonb_build_object('fout', 'Kies hoe het product of de dienst bij de koper komt.');
  end if;
  -- Nieuwe accounts (korter dan een week, nog niets verkocht) mogen klein beginnen.
  v_nieuw := v_id <> 1 and (select aangemaakt > now() - interval '7 days' from private.gebruikers where id = v_id)
             and not exists (select 1 from private.bestellingen where verkoper = v_id and status = 'afgerond');
  if v_nieuw and (select count(*) from private.aanbod where gebruiker_id = v_id and actief) >= 5 then
    return jsonb_build_object('fout', 'Nieuwe accounts kunnen de eerste week maximaal 5 dingen tegelijk aanbieden.');
  end if;
  if (select count(*) from private.aanbod where gebruiker_id = v_id and aangemaakt > now() - interval '1 day') >= 20 then
    return jsonb_build_object('fout', 'Je kunt maximaal 20 dingen per dag plaatsen.');
  end if;
  insert into private.aanbod (gebruiker_id, soort, titel, omschrijving, prijs, prijs_per, plaats, contact, betaalwijzen, levering)
  values (v_id, p_soort, left(trim(p_titel), 120), left(coalesce(p_omschrijving, ''), 4000),
          case when p_prijs < 0 then null else p_prijs end,
          left(coalesce(p_prijs_per, ''), 30), left(coalesce(p_plaats, ''), 80), left(coalesce(p_contact, ''), 200),
          p_betaalwijzen, p_levering)
  returning id into v_aanbod;
  return jsonb_build_object('ok', true, 'id', v_aanbod);
end; $$;

-- --- Bestellingen ---------------------------------------------------------------------

create table if not exists private.bestellingen (
  id bigint generated always as identity primary key,
  aanbod_id bigint not null references private.aanbod(id),
  koper bigint not null references private.gebruikers(id),
  verkoper bigint not null references private.gebruikers(id),
  tijdslot_id bigint references private.tijdsloten(id),
  titel text not null,
  bedrag numeric(10, 2),
  betaalwijze text not null check (betaalwijze in ('app', 'tikkie', 'contant', 'overmaken')),
  levering text not null check (levering in ('ophalen', 'verzenden', 'op_locatie', 'online')),
  status text not null default 'aangevraagd'
    check (status in ('aangevraagd', 'geaccepteerd', 'betaald', 'geleverd', 'afgerond', 'geannuleerd', 'geschil', 'terugbetaald')),
  betaal_referentie text,
  geschil_reden text not null default '',
  aangemaakt timestamptz not null default now(),
  bijgewerkt timestamptz not null default now()
);

create table if not exists private.beoordelingen (
  id bigint generated always as identity primary key,
  bestelling_id bigint not null references private.bestellingen(id),
  door bigint not null references private.gebruikers(id),
  over bigint not null references private.gebruikers(id),
  sterren integer not null check (sterren between 1 and 5),
  tekst text not null default '',
  aangemaakt timestamptz not null default now(),
  unique (bestelling_id, door)
);

-- Betrouwbaarheid van een gebruiker: lid sinds, sterren, afgeronde verkopen, mail ingevuld.
create or replace function private.vertrouwen(p_id bigint)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object(
    'lid_sinds', g.aangemaakt,
    'nieuw', g.aangemaakt > now() - interval '7 days',
    'sterren', (select round(avg(sterren), 1) from private.beoordelingen where over = p_id),
    'beoordelingen', (select count(*) from private.beoordelingen where over = p_id),
    'verkocht', (select count(*) from private.bestellingen where verkoper = p_id and status = 'afgerond'),
    'email', g.email is not null or g.id = 1,
    'email_bevestigd', g.email_bevestigd)
  from private.gebruikers g where g.id = p_id
$$;

create or replace function private.aanbod_json(a private.aanbod, p_ik bigint)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object(
    'id', a.id, 'soort', a.soort, 'titel', a.titel, 'omschrijving', a.omschrijving, 'prijs', a.prijs,
    'prijs_per', a.prijs_per, 'plaats', a.plaats, 'contact', a.contact, 'actief', a.actief,
    'betaalwijzen', to_jsonb(a.betaalwijzen), 'levering', to_jsonb(a.levering),
    'aanbieder', private.weergave(a.gebruiker_id), 'aanbieder_id', a.gebruiker_id, 'van_mij', a.gebruiker_id = p_ik,
    'vertrouwen', private.vertrouwen(a.gebruiker_id), 'aangemaakt', a.aangemaakt,
    'vrije_tijden', (select count(*) from private.tijdsloten t
                     where t.aanbod_id = a.id and t.geboekt_door is null and not t.geannuleerd and t.start > now()))
$$;

create or replace function private.bericht(p_aanbod bigint, p_van bigint, p_aan bigint, p_tekst text)
returns void language sql security definer set search_path to '' as $$
  insert into private.berichten (aanbod_id, van, aan, tekst) values (p_aanbod, p_van, p_aan, p_tekst)
$$;

create or replace function public.bestellen(p_naam text, p_wachtwoord text, p_aanbod bigint, p_betaalwijze text,
                                            p_levering text, p_bericht text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_a private.aanbod; v_best bigint;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into v_a from private.aanbod where id = p_aanbod and actief and not geblokkeerd;
  if v_a.id is null then return jsonb_build_object('fout', 'Dit aanbod is niet meer beschikbaar.'); end if;
  if v_a.gebruiker_id = v_id then return jsonb_build_object('fout', 'Dit is je eigen aanbod.'); end if;
  if v_id <> 1 and not exists (select 1 from private.gebruikers where id = v_id and email is not null) then
    return jsonb_build_object('fout', 'Vul eerst je mailadres in bij Instellingen › Account.');
  end if;
  if not p_betaalwijze = any(v_a.betaalwijzen) then
    return jsonb_build_object('fout', 'De verkoper accepteert deze betaalwijze niet.');
  end if;
  if not p_levering = any(v_a.levering) then
    return jsonb_build_object('fout', 'De verkoper biedt deze manier van leveren niet aan.');
  end if;
  if exists (select 1 from private.bestellingen where aanbod_id = p_aanbod and koper = v_id
             and status in ('aangevraagd', 'geaccepteerd', 'betaald', 'geleverd')) then
    return jsonb_build_object('fout', 'Je hebt dit al besteld. Kijk bij Bestellingen.');
  end if;
  -- Tegen nepaankopen: niet te veel openstaande bestellingen tegelijk, zeker niet voor nieuwe accounts.
  if (select count(*) from private.bestellingen where koper = v_id and status in ('aangevraagd', 'geaccepteerd'))
     >= (case when (select aangemaakt > now() - interval '7 days' from private.gebruikers where id = v_id) then 3 else 10 end) then
    return jsonb_build_object('fout', 'Je hebt al veel openstaande bestellingen. Rond die eerst af of annuleer ze.');
  end if;
  insert into private.bestellingen (aanbod_id, koper, verkoper, titel, bedrag, betaalwijze, levering)
  values (p_aanbod, v_id, v_a.gebruiker_id, v_a.titel, v_a.prijs, p_betaalwijze, p_levering)
  returning id into v_best;
  perform private.bericht(p_aanbod, v_id, v_a.gebruiker_id,
    'Ik wil dit graag kopen (betalen: ' || p_betaalwijze || ', ' || replace(p_levering, '_', ' ') || ')' ||
    case when coalesce(trim(p_bericht), '') <> '' then '. ' || left(trim(p_bericht), 1000) else '' end);
  return jsonb_build_object('ok', true, 'id', v_best);
end; $$;

-- Stappen van een bestelling. Wie wat mag:
--   verkoper: accepteren, weigeren, betaling_ontvangen (niet bij betalen via de app), geleverd
--   koper:    annuleren (voor betaling), ontvangen, probleem
-- Bij betalen via de app zet alleen de betaaldienst de status op betaald.
create or replace function public.bestelling_bijwerken(p_naam text, p_wachtwoord text, p_id bigint, p_actie text,
                                                       p_toelichting text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); b private.bestellingen; v_nieuw text; v_tekst text;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into b from private.bestellingen where id = p_id and (koper = v_id or verkoper = v_id) for update;
  if b.id is null then return jsonb_build_object('fout', 'Bestelling niet gevonden.'); end if;
  if v_id = b.verkoper then
    v_nieuw := case
      when p_actie = 'accepteren' and b.status = 'aangevraagd' then 'geaccepteerd'
      when p_actie = 'weigeren' and b.status in ('aangevraagd', 'geaccepteerd') then 'geannuleerd'
      when p_actie = 'betaling_ontvangen' and b.status = 'geaccepteerd' and b.betaalwijze <> 'app' then 'betaald'
      when p_actie = 'geleverd' and (b.status = 'betaald' or (b.status = 'geaccepteerd' and b.betaalwijze = 'contant'))
        then 'geleverd'
    end;
  end if;
  if v_nieuw is null and v_id = b.koper then
    v_nieuw := case
      when p_actie = 'annuleren' and b.status in ('aangevraagd', 'geaccepteerd') then 'geannuleerd'
      when p_actie = 'ontvangen' and b.status in ('betaald', 'geleverd') then 'afgerond'
      when p_actie = 'probleem' and b.status in ('betaald', 'geleverd') then 'geschil'
    end;
  end if;
  if v_nieuw is null then return jsonb_build_object('fout', 'Dat kan nu niet bij deze bestelling.'); end if;
  if v_nieuw = 'geschil' and coalesce(trim(p_toelichting), '') = '' then
    return jsonb_build_object('fout', 'Beschrijf wat er mis is.');
  end if;
  update private.bestellingen set status = v_nieuw, bijgewerkt = now(),
         geschil_reden = case when v_nieuw = 'geschil' then left(trim(p_toelichting), 1000) else geschil_reden end
  where id = p_id;
  v_tekst := case v_nieuw
    when 'geaccepteerd' then 'Bestelling geaccepteerd' || case when b.betaalwijze = 'app' then '. Je kunt nu betalen in de app.' else '.' end
    when 'geannuleerd' then 'Bestelling geannuleerd'
    when 'betaald' then 'Betaling ontvangen, bedankt!'
    when 'geleverd' then 'Geleverd. Laat je weten of alles goed is ontvangen?'
    when 'afgerond' then 'Alles goed ontvangen, bedankt!'
    when 'geschil' then 'Er is een probleem gemeld'
  end || case when coalesce(trim(p_toelichting), '') <> '' then ': ' || left(trim(p_toelichting), 1000) else '' end;
  perform private.bericht(b.aanbod_id, v_id, case when v_id = b.koper then b.verkoper else b.koper end, v_tekst);
  -- Een verkocht product (niet een dienst) gaat van de marktplaats af.
  if v_nieuw = 'afgerond' then
    update private.aanbod set actief = false where id = b.aanbod_id and soort = 'product';
  end if;
  return jsonb_build_object('ok', true, 'status', v_nieuw);
end; $$;

create or replace function public.mijn_bestellingen(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object('bestellingen', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', b.id, 'aanbod_id', b.aanbod_id, 'titel', b.titel, 'bedrag', b.bedrag, 'betaalwijze', b.betaalwijze,
      'levering', b.levering, 'status', b.status, 'aangemaakt', b.aangemaakt, 'bijgewerkt', b.bijgewerkt,
      'rol', case when b.koper = v_id then 'koper' else 'verkoper' end,
      'ander_id', case when b.koper = v_id then b.verkoper else b.koper end,
      'ander', private.weergave(case when b.koper = v_id then b.verkoper else b.koper end),
      'vertrouwen_ander', private.vertrouwen(case when b.koper = v_id then b.verkoper else b.koper end),
      'beoordeeld', exists (select 1 from private.beoordelingen r where r.bestelling_id = b.id and r.door = v_id))
      order by b.bijgewerkt desc)
    from private.bestellingen b
    where (b.koper = v_id or b.verkoper = v_id)
      and (b.status not in ('afgerond', 'geannuleerd', 'terugbetaald') or b.bijgewerkt > now() - interval '60 days')),
    '[]'::jsonb));
end; $$;

create or replace function public.beoordelen(p_naam text, p_wachtwoord text, p_bestelling bigint, p_sterren integer,
                                             p_tekst text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); b private.bestellingen;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into b from private.bestellingen where id = p_bestelling and (koper = v_id or verkoper = v_id);
  if b.id is null or b.status <> 'afgerond' then
    return jsonb_build_object('fout', 'Je kunt pas beoordelen als de bestelling is afgerond.');
  end if;
  if p_sterren not between 1 and 5 then return jsonb_build_object('fout', 'Kies 1 tot 5 sterren.'); end if;
  insert into private.beoordelingen (bestelling_id, door, over, sterren, tekst)
  values (b.id, v_id, case when v_id = b.koper then b.verkoper else b.koper end, p_sterren, left(coalesce(p_tekst, ''), 500))
  on conflict (bestelling_id, door) do nothing;
  if not found then return jsonb_build_object('fout', 'Je hebt deze bestelling al beoordeeld.'); end if;
  return jsonb_build_object('ok', true);
end; $$;

-- Meerdere meldingen van verschillende mensen: aanbod gaat meteen offline tot de beheerder kijkt.
create or replace function public.melden(p_naam text, p_wachtwoord text, p_aanbod bigint, p_reden text)
returns boolean language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null or trim(coalesce(p_reden, '')) = '' then return false; end if;
  insert into private.meldingen (aanbod_id, door, reden) values (p_aanbod, v_id, left(trim(p_reden), 1000));
  if (select count(distinct door) from private.meldingen where aanbod_id = p_aanbod and not afgehandeld) >= 3 then
    update private.aanbod set geblokkeerd = true where id = p_aanbod;
  end if;
  return true;
end; $$;

-- --- Beheer: geschillen ------------------------------------------------------------------

create or replace function public.beheer_geschillen(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is distinct from 1 then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object('geschillen', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', b.id, 'titel', b.titel, 'bedrag', b.bedrag, 'betaalwijze', b.betaalwijze, 'reden', b.geschil_reden,
      'koper', private.weergave(b.koper), 'verkoper', private.weergave(b.verkoper), 'bijgewerkt', b.bijgewerkt,
      'berichten', (select jsonb_agg(jsonb_build_object('van', private.weergave(m.van), 'tekst', m.tekst,
                                                        'aangemaakt', m.aangemaakt) order by m.id)
                    from private.berichten m where m.aanbod_id = b.aanbod_id
                      and ((m.van = b.koper and m.aan = b.verkoper) or (m.van = b.verkoper and m.aan = b.koper))))
      order by b.id)
    from private.bestellingen b where b.status = 'geschil'), '[]'::jsonb));
end; $$;

-- Uitkomst 'koper': geld terug (bij betalen via de app doet de betaaldienst dat). 'verkoper': afgerond.
create or replace function public.beheer_geschil_afhandelen(p_naam text, p_wachtwoord text, p_id bigint, p_uitkomst text)
returns boolean language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is distinct from 1 or p_uitkomst not in ('koper', 'verkoper') then return false; end if;
  update private.bestellingen set status = case when p_uitkomst = 'koper' then 'terugbetaald' else 'afgerond' end,
         bijgewerkt = now()
  where id = p_id and status = 'geschil';
  return found;
end; $$;

revoke all on all functions in schema private from public, anon, authenticated;
