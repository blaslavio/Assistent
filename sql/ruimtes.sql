-- VR-ruimtes: iedereen kan een 3D-ruimte maken om een project te laten zien (foto's, teksten, 3D-modellen).
-- Een openbare ruimte staat in de app bij 🥽 VR-ruimtes en is te bekijken via ?ruimte=nummer, ook zonder account.
-- Wordt een ruimte door drie verschillende mensen gemeld, dan gaat hij offline tot de beheerder kijkt.

create table if not exists private.ruimtes (
  id bigint generated always as identity primary key,
  gebruiker_id bigint not null references private.gebruikers(id),
  titel text not null,
  omschrijving text not null default '',
  thema text not null default 'galerie' check (thema in ('galerie', 'museum', 'natuur', 'studio')),
  kleur text not null default '#2563eb' check (kleur ~ '^#[0-9a-fA-F]{6}$'),
  openbaar boolean not null default false,
  verborgen boolean not null default false,
  bezoeken integer not null default 0,
  weg boolean not null default false,  -- verwijderd door de maker (inhoud is dan leeggemaakt)
  aangemaakt timestamptz not null default now(),
  bijgewerkt timestamptz not null default now()
);

create table if not exists private.ruimte_items (
  id bigint generated always as identity primary key,
  ruimte_id bigint not null references private.ruimtes(id),
  volgorde integer not null default 0,
  soort text not null check (soort in ('foto', 'tekst', 'model')),
  titel text not null default '',
  tekst text not null default '',
  data text not null default '',      -- base64 van de foto (jpeg) of het 3D-model (glb)
  klein text not null default '',     -- kleine foto voor overzichten
  breedte integer,
  hoogte integer,
  weg boolean not null default false,
  aangemaakt timestamptz not null default now()
);
create index if not exists ruimte_items_ruimte on private.ruimte_items (ruimte_id, volgorde);

create table if not exists private.ruimte_meldingen (
  id bigint generated always as identity primary key,
  ruimte_id bigint not null references private.ruimtes(id),
  door bigint not null references private.gebruikers(id),
  reden text not null,
  afgehandeld boolean not null default false,
  aangemaakt timestamptz not null default now(),
  unique (ruimte_id, door)
);

create or replace function private.ruimte_json(r private.ruimtes)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object(
    'id', r.id, 'titel', r.titel, 'omschrijving', r.omschrijving, 'thema', r.thema, 'kleur', r.kleur,
    'openbaar', r.openbaar, 'verborgen', r.verborgen, 'bezoeken', r.bezoeken, 'bijgewerkt', r.bijgewerkt,
    'maker', private.weergave(r.gebruiker_id), 'maker_id', r.gebruiker_id,
    'items', (select count(*) from private.ruimte_items i where i.ruimte_id = r.id and not i.weg),
    'omslag', (select i.klein from private.ruimte_items i where i.ruimte_id = r.id and i.soort = 'foto' and not i.weg
               order by i.volgorde, i.id limit 1))
$$;

create or replace function public.mijn_ruimtes(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object('ruimtes', coalesce((select jsonb_agg(private.ruimte_json(r) order by r.bijgewerkt desc)
                                                 from private.ruimtes r where r.gebruiker_id = v_id and not r.weg), '[]'::jsonb));
end; $$;

create or replace function public.ruimte_opslaan(p_naam text, p_wachtwoord text, p_id bigint, p_titel text,
                                                 p_omschrijving text, p_thema text, p_kleur text, p_openbaar boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_ruimte bigint;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if trim(coalesce(p_titel, '')) = '' then return jsonb_build_object('fout', 'Geef je ruimte een titel.'); end if;
  if p_thema not in ('galerie', 'museum', 'natuur', 'studio') then p_thema := 'galerie'; end if;
  if coalesce(p_kleur, '') !~ '^#[0-9a-fA-F]{6}$' then p_kleur := '#2563eb'; end if;
  if p_id is null then
    if (select count(*) from private.ruimtes where gebruiker_id = v_id and not weg) >= 20 then
      return jsonb_build_object('fout', 'Je kunt maximaal 20 ruimtes hebben.');
    end if;
    insert into private.ruimtes (gebruiker_id, titel, omschrijving, thema, kleur, openbaar)
    values (v_id, left(trim(p_titel), 80), left(coalesce(p_omschrijving, ''), 2000), p_thema, p_kleur,
            coalesce(p_openbaar, false))
    returning id into v_ruimte;
  else
    update private.ruimtes set titel = left(trim(p_titel), 80), omschrijving = left(coalesce(p_omschrijving, ''), 2000),
           thema = p_thema, kleur = p_kleur, openbaar = coalesce(p_openbaar, false), bijgewerkt = now()
    where id = p_id and gebruiker_id = v_id and not weg returning id into v_ruimte;
    if v_ruimte is null then return jsonb_build_object('fout', 'Ruimte niet gevonden.'); end if;
  end if;
  return jsonb_build_object('ok', true, 'id', v_ruimte);
end; $$;

create or replace function public.ruimte_weg(p_naam text, p_wachtwoord text, p_id bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  update private.ruimtes set weg = true, openbaar = false, titel = '', omschrijving = ''
  where id = p_id and gebruiker_id = v_id and not weg;
  if found then
    update private.ruimte_items set weg = true, data = '', klein = '', titel = '', tekst = '' where ruimte_id = p_id;
  end if;
  return jsonb_build_object('ok', found);
end; $$;

-- Foto: jpeg (base64) tot 1,5 MB. 3D-model: glb (base64) tot 4 MB, hooguit 2 per ruimte. Hooguit 30 dingen per ruimte.
create or replace function public.ruimte_item_toevoegen(p_naam text, p_wachtwoord text, p_ruimte bigint, p_soort text,
                                                        p_titel text, p_tekst text, p_data text, p_klein text,
                                                        p_breedte integer, p_hoogte integer)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_item bigint;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if not exists (select 1 from private.ruimtes where id = p_ruimte and gebruiker_id = v_id and not weg) then
    return jsonb_build_object('fout', 'Ruimte niet gevonden.');
  end if;
  if p_soort not in ('foto', 'tekst', 'model') then return jsonb_build_object('fout', 'Onbekende soort.'); end if;
  if (select count(*) from private.ruimte_items where ruimte_id = p_ruimte and not weg) >= 30 then
    return jsonb_build_object('fout', 'Een ruimte kan maximaal 30 dingen bevatten.');
  end if;
  if p_soort = 'foto' and (coalesce(p_data, '') = '' or length(p_data) > 2000000) then
    return jsonb_build_object('fout', 'Deze foto is te groot.');
  end if;
  if p_soort = 'model' then
    if coalesce(p_data, '') = '' or length(p_data) > 5600000 then
      return jsonb_build_object('fout', 'Een 3D-model mag hooguit 4 MB zijn.');
    end if;
    if (select count(*) from private.ruimte_items where ruimte_id = p_ruimte and soort = 'model' and not weg) >= 2 then
      return jsonb_build_object('fout', 'Een ruimte kan maximaal 2 3D-modellen bevatten.');
    end if;
  end if;
  if p_soort = 'tekst' and trim(coalesce(p_titel, '') || coalesce(p_tekst, '')) = '' then
    return jsonb_build_object('fout', 'Schrijf een titel of tekst.');
  end if;
  insert into private.ruimte_items (ruimte_id, volgorde, soort, titel, tekst, data, klein, breedte, hoogte)
  values (p_ruimte, coalesce((select max(volgorde) + 1 from private.ruimte_items where ruimte_id = p_ruimte), 0),
          p_soort, left(coalesce(p_titel, ''), 120), left(coalesce(p_tekst, ''), 1500),
          case when p_soort = 'tekst' then '' else p_data end, left(coalesce(p_klein, ''), 80000), p_breedte, p_hoogte)
  returning id into v_item;
  update private.ruimtes set bijgewerkt = now() where id = p_ruimte;
  return jsonb_build_object('ok', true, 'id', v_item);
end; $$;

create or replace function public.ruimte_item_weg(p_naam text, p_wachtwoord text, p_item bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  update private.ruimte_items i set weg = true, data = '', klein = '', titel = '', tekst = ''
  from private.ruimtes r where i.id = p_item and r.id = i.ruimte_id and r.gebruiker_id = v_id and not i.weg;
  return jsonb_build_object('ok', found);
end; $$;

-- Volgorde: verschuif een ding één plek naar voren (-1) of achteren (1).
create or replace function public.ruimte_item_verplaatsen(p_naam text, p_wachtwoord text, p_item bigint, p_richting integer)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_ruimte bigint; v_ids bigint[]; v_pos integer;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select i.ruimte_id into v_ruimte from private.ruimte_items i join private.ruimtes r on r.id = i.ruimte_id
  where i.id = p_item and r.gebruiker_id = v_id and not i.weg;
  if v_ruimte is null then return jsonb_build_object('fout', 'Niet gevonden.'); end if;
  select array_agg(id order by volgorde, id) into v_ids from private.ruimte_items where ruimte_id = v_ruimte and not weg;
  v_pos := array_position(v_ids, p_item);
  if v_pos + p_richting between 1 and array_length(v_ids, 1) then
    v_ids[v_pos] := v_ids[v_pos + p_richting];
    v_ids[v_pos + p_richting] := p_item;
  end if;
  update private.ruimte_items i set volgorde = n.pos
  from unnest(v_ids) with ordinality as n(id, pos) where i.id = n.id;
  return jsonb_build_object('ok', true);
end; $$;

-- --- Bekijken: openbare ruimtes voor iedereen, eigen ruimtes ook als ze niet openbaar zijn ------------

create or replace function public.ruimtes_zoeken(p_zoekterm text)
returns jsonb language sql stable security definer set search_path to '' as $$
  select coalesce(jsonb_agg(x order by (x->>'bijgewerkt') desc), '[]'::jsonb) from (
    select private.ruimte_json(r) as x
    from private.ruimtes r join private.gebruikers g on g.id = r.gebruiker_id
    where r.openbaar and not r.verborgen and not r.weg and not g.geblokkeerd and not g.verwijderd
      and exists (select 1 from private.ruimte_items i where i.ruimte_id = r.id and not i.weg)
      and (coalesce(trim(p_zoekterm), '') = '' or r.titel ilike '%' || trim(p_zoekterm) || '%'
           or r.omschrijving ilike '%' || trim(p_zoekterm) || '%')
    limit 100) s
$$;

create or replace function public.ruimte_bekijken(p_naam text, p_wachtwoord text, p_id bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := case when coalesce(p_wachtwoord, '') = '' then null
                            else private.gebruiker_id(p_naam, p_wachtwoord) end;
        r private.ruimtes;
begin
  select * into r from private.ruimtes where id = p_id and not weg;
  if r.id is null or (r.gebruiker_id is distinct from v_id and (not r.openbaar or r.verborgen
      or exists (select 1 from private.gebruikers where id = r.gebruiker_id and (geblokkeerd or verwijderd)))) then
    return jsonb_build_object('fout', 'Deze ruimte bestaat niet of is niet openbaar.');
  end if;
  if r.gebruiker_id is distinct from v_id then
    update private.ruimtes set bezoeken = bezoeken + 1 where id = r.id;
  end if;
  return private.ruimte_json(r) || jsonb_build_object(
    'van_mij', r.gebruiker_id = v_id,
    'dingen', coalesce((select jsonb_agg(jsonb_build_object(
        'id', i.id, 'soort', i.soort, 'titel', i.titel, 'tekst', i.tekst, 'data', i.data,
        'breedte', i.breedte, 'hoogte', i.hoogte) order by i.volgorde, i.id)
      from private.ruimte_items i where i.ruimte_id = r.id and not i.weg), '[]'::jsonb));
end; $$;

-- Overzicht zonder de grote bestanden, voor het bewerken.
create or replace function public.ruimte_inhoud(p_naam text, p_wachtwoord text, p_id bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object('dingen', coalesce((select jsonb_agg(jsonb_build_object(
      'id', i.id, 'soort', i.soort, 'titel', i.titel, 'tekst', i.tekst, 'klein', i.klein) order by i.volgorde, i.id)
    from private.ruimte_items i join private.ruimtes r on r.id = i.ruimte_id
    where r.id = p_id and r.gebruiker_id = v_id and not i.weg), '[]'::jsonb));
end; $$;

create or replace function public.ruimte_melden(p_naam text, p_wachtwoord text, p_id bigint, p_reden text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if trim(coalesce(p_reden, '')) = '' then return jsonb_build_object('fout', 'Schrijf wat er niet klopt.'); end if;
  insert into private.ruimte_meldingen (ruimte_id, door, reden) values (p_id, v_id, left(trim(p_reden), 1000))
  on conflict (ruimte_id, door) do nothing;
  if (select count(*) from private.ruimte_meldingen where ruimte_id = p_id and not afgehandeld) >= 3 then
    update private.ruimtes set verborgen = true where id = p_id;
  end if;
  return jsonb_build_object('ok', true);
end; $$;

-- Beheer: meldingen bekijken en een ruimte weer tonen of verborgen laten.
create or replace function public.beheer_ruimte_meldingen(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is distinct from 1 then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object('meldingen', coalesce((select jsonb_agg(jsonb_build_object(
      'id', m.id, 'ruimte_id', m.ruimte_id, 'titel', r.titel, 'maker', private.weergave(r.gebruiker_id),
      'reden', m.reden, 'verborgen', r.verborgen, 'aangemaakt', m.aangemaakt) order by m.id desc)
    from private.ruimte_meldingen m join private.ruimtes r on r.id = m.ruimte_id where not m.afgehandeld and not r.weg), '[]'::jsonb));
end; $$;

create or replace function public.beheer_ruimte_afhandelen(p_naam text, p_wachtwoord text, p_ruimte bigint,
                                                           p_verbergen boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is distinct from 1 then return jsonb_build_object('geen_toegang', true); end if;
  update private.ruimtes set verborgen = coalesce(p_verbergen, false) where id = p_ruimte;
  update private.ruimte_meldingen set afgehandeld = true where ruimte_id = p_ruimte;
  return jsonb_build_object('ok', true);
end; $$;

-- Account verwijderen: ook ruimtes (met foto's en modellen) weg en de webshop dicht.
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
  update private.aanbod set actief = false, omschrijving = '', contact = '', in_winkel = false where gebruiker_id = v_id;
  update private.winkels set open = false, omschrijving = '', retour = '' where gebruiker_id = v_id;
  update private.ruimtes set weg = true, openbaar = false, titel = '', omschrijving = '' where gebruiker_id = v_id;
  update private.ruimte_items i set weg = true, data = '', klein = '', titel = '', tekst = ''
  from private.ruimtes r where r.id = i.ruimte_id and r.gebruiker_id = v_id;
  update private.project_leden set actief = false where gebruiker_id = v_id;
  update private.gebruikers set verwijderd = true, naam = null, email = null, weergavenaam = 'Verwijderd account',
         hash = extensions.crypt(extensions.gen_random_uuid()::text, extensions.gen_salt('bf', 4))
  where id = v_id;
  return true;
end; $$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function public.mijn_ruimtes(text, text),
  public.ruimte_opslaan(text, text, bigint, text, text, text, text, boolean), public.ruimte_weg(text, text, bigint),
  public.ruimte_item_toevoegen(text, text, bigint, text, text, text, text, text, integer, integer),
  public.ruimte_item_weg(text, text, bigint), public.ruimte_item_verplaatsen(text, text, bigint, integer),
  public.ruimtes_zoeken(text), public.ruimte_bekijken(text, text, bigint), public.ruimte_inhoud(text, text, bigint),
  public.ruimte_melden(text, text, bigint, text), public.beheer_ruimte_meldingen(text, text),
  public.beheer_ruimte_afhandelen(text, text, bigint, boolean) from public;
grant execute on function public.mijn_ruimtes(text, text),
  public.ruimte_opslaan(text, text, bigint, text, text, text, text, boolean), public.ruimte_weg(text, text, bigint),
  public.ruimte_item_toevoegen(text, text, bigint, text, text, text, text, text, integer, integer),
  public.ruimte_item_weg(text, text, bigint), public.ruimte_item_verplaatsen(text, text, bigint, integer),
  public.ruimtes_zoeken(text), public.ruimte_bekijken(text, text, bigint), public.ruimte_inhoud(text, text, bigint),
  public.ruimte_melden(text, text, bigint, text), public.beheer_ruimte_meldingen(text, text),
  public.beheer_ruimte_afhandelen(text, text, bigint, boolean)
  to anon, authenticated;
