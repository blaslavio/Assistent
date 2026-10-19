-- Accountniveaus: particulier (iedereen, alle basisfuncties), verkoper en ondernemer.
-- Iedereen mag aanbieden; het niveau bepaalt hoeveel tegelijk en welke extra hulpmiddelen er zijn.
-- Ondernemers hebben een bedrijfsprofiel (naam, KvK, eventueel btw-nummer); kopers zien dat ze bij een
-- bedrijf kopen (dan geldt de wettelijke bedenktijd).

alter table private.gebruikers add column if not exists niveau text not null default 'particulier'
  check (niveau in ('particulier', 'verkoper', 'ondernemer'));
alter table private.gebruikers add column if not exists bedrijf jsonb;

create or replace function private.max_aanbod(p_id bigint)
returns int language sql stable security definer set search_path to '' as $$
  select case when p_id = 1 then 1000 else
    case niveau when 'ondernemer' then 1000 when 'verkoper' then 100 else 10 end end
  from private.gebruikers where id = p_id
$$;

create or replace function public.niveau_instellen(p_naam text, p_wachtwoord text, p_niveau text, p_bedrijf jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
  v_bedrijf jsonb;
  v_kvk text := regexp_replace(coalesce(p_bedrijf ->> 'kvk', ''), '\s', '', 'g');
  v_btw text := upper(regexp_replace(coalesce(p_bedrijf ->> 'btw', ''), '[\s.]', '', 'g'));
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if p_niveau not in ('particulier', 'verkoper', 'ondernemer') then
    return jsonb_build_object('fout', 'Kies een accounttype.');
  end if;
  if p_niveau <> 'particulier' and v_id <> 1
     and not exists (select 1 from private.gebruikers where id = v_id and email is not null) then
    return jsonb_build_object('fout', 'Vul eerst je mailadres in bij Mijn account.');
  end if;
  if p_niveau = 'ondernemer' then
    if trim(coalesce(p_bedrijf ->> 'naam', '')) = '' then
      return jsonb_build_object('fout', 'Vul de naam van je bedrijf in.');
    end if;
    if v_kvk !~ '^[0-9]{8}$' then
      return jsonb_build_object('fout', 'Een KvK-nummer heeft 8 cijfers.');
    end if;
    if v_btw <> '' and v_btw !~ '^NL[0-9]{9}B[0-9]{2}$' then
      return jsonb_build_object('fout', 'Een btw-nummer ziet eruit als NL123456789B01. Laat het leeg als je de KOR gebruikt.');
    end if;
    v_bedrijf := jsonb_build_object(
      'naam', left(trim(p_bedrijf ->> 'naam'), 100), 'kvk', v_kvk, 'btw', nullif(v_btw, ''),
      'adres', left(trim(coalesce(p_bedrijf ->> 'adres', '')), 200),
      'website', left(trim(coalesce(p_bedrijf ->> 'website', '')), 200),
      'btw_tarief', case when (p_bedrijf ->> 'btw_tarief') in ('21', '9', '0') then (p_bedrijf ->> 'btw_tarief')::int
                         else 21 end,
      'retour', left(trim(coalesce(p_bedrijf ->> 'retour', '')), 500));
  end if;
  if (select count(*) from private.aanbod where gebruiker_id = v_id and actief) >
     (case p_niveau when 'ondernemer' then 1000 when 'verkoper' then 100 else 10 end) and v_id <> 1 then
    return jsonb_build_object('fout', 'Je hebt te veel aanbod online voor dit accounttype. Zet eerst wat offline.');
  end if;
  update private.gebruikers set niveau = p_niveau,
    bedrijf = case when p_niveau = 'ondernemer' then v_bedrijf else bedrijf end
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
                                            'email', email, 'email_bevestigd', email_bevestigd, 'beheerder', id = 1,
                                            'niveau', niveau, 'bedrijf', bedrijf, 'max_aanbod', private.max_aanbod(id))
                  from private.gebruikers where id = v_id));
end; $$;

-- Kopers zien bij aanbod en bestellingen of ze bij een bedrijf kopen.
create or replace function private.vertrouwen(p_id bigint)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object(
    'lid_sinds', g.aangemaakt,
    'nieuw', g.aangemaakt > now() - interval '7 days',
    'sterren', (select round(avg(sterren), 1) from private.beoordelingen where over = p_id),
    'beoordelingen', (select count(*) from private.beoordelingen where over = p_id),
    'verkocht', (select count(*) from private.bestellingen where verkoper = p_id and status = 'afgerond'),
    'email', g.email is not null or g.id = 1,
    'email_bevestigd', g.email_bevestigd,
    'geverifieerd', g.stripe_klaar,
    'niveau', g.niveau,
    'bedrijf', case when g.niveau = 'ondernemer' then jsonb_build_object(
      'naam', g.bedrijf ->> 'naam', 'kvk', g.bedrijf ->> 'kvk', 'btw', g.bedrijf ->> 'btw',
      'adres', g.bedrijf ->> 'adres', 'website', g.bedrijf ->> 'website', 'retour', g.bedrijf ->> 'retour') end)
  from private.gebruikers g where g.id = p_id
$$;

-- Hetzelfde als eerder, met een maximum per accounttype.
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
  if 'app' = any(p_betaalwijzen) then
    if not (select stripe_klaar from private.gebruikers where id = v_id) then
      return jsonb_build_object('fout', 'Om betalingen via de app te ontvangen, meld je je eerst aan bij Stripe (Kopen en verkopen › Verkopen).');
    end if;
    if coalesce(p_prijs, 0) < 1 then
      return jsonb_build_object('fout', 'Betalen via de app kan vanaf 1 euro. Vul een prijs in.');
    end if;
  end if;
  if coalesce(array_length(p_levering, 1), 0) = 0
     or not p_levering <@ array['ophalen', 'verzenden', 'op_locatie', 'online'] then
    return jsonb_build_object('fout', 'Kies hoe het product of de dienst bij de koper komt.');
  end if;
  v_nieuw := v_id <> 1 and (select aangemaakt > now() - interval '7 days' from private.gebruikers where id = v_id)
             and not exists (select 1 from private.bestellingen where verkoper = v_id and status = 'afgerond');
  if v_nieuw and (select count(*) from private.aanbod where gebruiker_id = v_id and actief) >= 5 then
    return jsonb_build_object('fout', 'Nieuwe accounts kunnen de eerste week maximaal 5 dingen tegelijk aanbieden.');
  end if;
  if (select count(*) from private.aanbod where gebruiker_id = v_id and actief) >= private.max_aanbod(v_id) then
    return jsonb_build_object('fout', format('Je kunt met je accounttype %s dingen tegelijk aanbieden. Zet iets offline, '
      || 'of kies een ander accounttype bij Instellingen › Account.', private.max_aanbod(v_id)));
  end if;
  if (select count(*) from private.aanbod where gebruiker_id = v_id and aangemaakt > now() - interval '1 day')
     >= (case when (select niveau from private.gebruikers where id = v_id) = 'particulier' then 20 else 200 end) then
    return jsonb_build_object('fout', 'Je hebt vandaag het maximum aantal dingen geplaatst. Probeer het morgen weer.');
  end if;
  insert into private.aanbod (gebruiker_id, soort, titel, omschrijving, prijs, prijs_per, plaats, contact, betaalwijzen, levering)
  values (v_id, p_soort, left(trim(p_titel), 120), left(coalesce(p_omschrijving, ''), 4000),
          case when p_prijs < 0 then null else p_prijs end,
          left(coalesce(p_prijs_per, ''), 30), left(coalesce(p_plaats, ''), 80), left(coalesce(p_contact, ''), 200),
          p_betaalwijzen, p_levering)
  returning id into v_aanbod;
  return jsonb_build_object('ok', true, 'id', v_aanbod);
end; $$;

-- Verkoopoverzicht voor verkopers en ondernemers: per maand, best verkocht en klanten.
create or replace function public.verkoop_overzicht(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object(
    'maanden', coalesce((select jsonb_agg(m order by m.maand) from (
        select to_char(date_trunc('month', bijgewerkt), 'YYYY-MM') as maand, count(*) as aantal, sum(bedrag) as omzet
        from private.bestellingen
        where verkoper = v_id and status = 'afgerond' and bijgewerkt > date_trunc('month', now()) - interval '11 months'
        group by 1) m), '[]'::jsonb),
    'top', coalesce((select jsonb_agg(t) from (
        select titel, count(*) as aantal, sum(bedrag) as omzet from private.bestellingen
        where verkoper = v_id and status = 'afgerond' group by titel order by sum(bedrag) desc limit 5) t), '[]'::jsonb),
    'klanten', coalesce((select jsonb_agg(k) from (
        select private.weergave(koper) as naam, count(*) as aantal, sum(bedrag) as totaal, max(bijgewerkt) as laatst
        from private.bestellingen where verkoper = v_id and status = 'afgerond'
        group by koper order by max(bijgewerkt) desc limit 50) k), '[]'::jsonb),
    'facturen', coalesce((select jsonb_agg(f order by f.datum desc) from (
        select id, titel, bedrag, levering, betaalwijze, bijgewerkt as datum, private.weergave(koper) as klant
        from private.bestellingen where verkoper = v_id and status in ('betaald', 'geleverd', 'afgerond')
          and bijgewerkt > now() - interval '24 months') f), '[]'::jsonb),
    'open', (select count(*) from private.bestellingen
             where verkoper = v_id and status in ('aangevraagd', 'geaccepteerd', 'betaald', 'geleverd', 'geschil')),
    'actief_aanbod', (select count(*) from private.aanbod where gebruiker_id = v_id and actief),
    'max_aanbod', private.max_aanbod(v_id),
    'beoordeling', private.vertrouwen(v_id));
end; $$;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function public.niveau_instellen(text, text, text, jsonb), public.verkoop_overzicht(text, text)
  to anon, authenticated;
