-- Je winkel ontwerpen, zoals in een webshopbouwer: een stijl, een bannerfoto, een welkomstekst, uitgelichte
-- producten, over ons, veelgestelde vragen, links en openingstijden, in de volgorde die jij kiest. Met een voorbeeld
-- dat je ziet voordat je winkel open is. Alleen toevoegen: bestaande winkels houden hun gewone opmaak.

alter table private.winkels add column if not exists opmaak jsonb not null default '{}'::jsonb;
alter table private.winkels add column if not exists banner text;

-- Controleert de opmaak en houdt alleen over wat de app kent, met grenzen aan de lengte. Links alleen met https.
create or replace function private.opmaak_schoon(p jsonb)
returns jsonb language plpgsql immutable set search_path to '' as $$
declare
  v_stijl text := coalesce(p->>'stijl', 'etalage');
  v_delen text[] := array['uitgelicht', 'producten', 'over', 'vragen', 'links', 'openingstijden'];
  v_volgorde jsonb := '[]'::jsonb;
  v_vragen jsonb := '[]'::jsonb;
  v_links jsonb := '[]'::jsonb;
  v_uitgelicht jsonb := '[]'::jsonb;
  x jsonb;
begin
  if jsonb_typeof(p) is distinct from 'object' then p := '{}'::jsonb; end if;
  if v_stijl not in ('etalage', 'lijst', 'magazine') then v_stijl := 'etalage'; end if;
  if jsonb_typeof(p->'volgorde') = 'array' then
    for x in select * from jsonb_array_elements(p->'volgorde') loop
      if jsonb_typeof(x) = 'string' and (x #>> '{}') = any(v_delen) and not v_volgorde @> jsonb_build_array(x) then
        v_volgorde := v_volgorde || jsonb_build_array(x);
      end if;
    end loop;
  else
    v_volgorde := '["uitgelicht", "producten", "over", "vragen", "links", "openingstijden"]'::jsonb;
  end if;
  if jsonb_typeof(p->'vragen') = 'array' then
    for x in select * from jsonb_array_elements(p->'vragen') limit 12 loop
      if coalesce(trim(x->>'vraag'), '') <> '' then
        v_vragen := v_vragen || jsonb_build_array(jsonb_build_object('vraag', left(trim(x->>'vraag'), 200),
          'antwoord', left(coalesce(trim(x->>'antwoord'), ''), 1000)));
      end if;
    end loop;
  end if;
  if jsonb_typeof(p->'links') = 'array' then
    for x in select * from jsonb_array_elements(p->'links') limit 8 loop
      if coalesce(x->>'url', '') ~ '^https://[^\s<>"]+$' and length(x->>'url') <= 300 then
        v_links := v_links || jsonb_build_array(jsonb_build_object('label',
          left(coalesce(nullif(trim(x->>'label'), ''), x->>'url'), 40), 'url', x->>'url'));
      end if;
    end loop;
  end if;
  if jsonb_typeof(p->'uitgelicht') = 'array' then
    for x in select * from jsonb_array_elements(p->'uitgelicht') limit 8 loop
      if jsonb_typeof(x) = 'number' then v_uitgelicht := v_uitgelicht || jsonb_build_array(x); end if;
    end loop;
  end if;
  return jsonb_build_object(
    'stijl', v_stijl,
    'kop', left(coalesce(trim(p->>'kop'), ''), 80),
    'welkom', left(coalesce(trim(p->>'welkom'), ''), 600),
    'over', left(coalesce(trim(p->>'over'), ''), 3000),
    'openingstijden', left(coalesce(trim(p->>'openingstijden'), ''), 400),
    'knop', left(coalesce(trim(p->>'knop'), ''), 24),
    'volgorde', v_volgorde, 'vragen', v_vragen, 'links', v_links, 'uitgelicht', v_uitgelicht);
end; $$;

create or replace function private.winkel_json(w private.winkels)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('adres', w.adres, 'naam', w.naam, 'omschrijving', w.omschrijving, 'kleur', w.kleur,
                            'verzendkosten', w.verzendkosten, 'gratis_vanaf', w.gratis_vanaf, 'retour', w.retour,
                            'open', w.open, 'winkeladres', w.winkeladres, 'lat', w.lat, 'lon', w.lon,
                            'actie', case when w.actie_tot is null or w.actie_tot >= current_date then w.actie else '' end,
                            'actie_tot', w.actie_tot,
                            'volgers', (select count(*) from private.winkel_volgers v where v.verkoper = w.gebruiker_id and v.actief),
                            'soort', w.soort, 'bezorgen', w.bezorgen, 'bezorg_km', w.bezorg_km,
                            'bezorgkosten', w.bezorgkosten, 'bezorg_minimum', w.bezorg_minimum,
                            'bezorg_minuten', w.bezorg_minuten, 'bezorg_van', to_char(w.bezorg_van, 'HH24:MI'),
                            'bezorg_tot', to_char(w.bezorg_tot, 'HH24:MI'), 'bezorgt_nu', private.bezorgt_nu(w),
                            'opmaak', w.opmaak, 'heeft_banner', w.banner is not null)
$$;

-- De hele winkelpagina: dezelfde voor kopers (open winkel) en voor het voorbeeld van de eigenaar.
create or replace function private.winkel_pagina(w private.winkels)
returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  perform private.webshop_opruimen();
  return private.winkel_json(w) || jsonb_build_object(
    'verkoper', private.weergave(w.gebruiker_id), 'verkoper_id', w.gebruiker_id,
    'vertrouwen', private.vertrouwen(w.gebruiker_id),
    'kan_betalen', private.winkel_kan_betalen(w.gebruiker_id),
    'producten', coalesce((select jsonb_agg(jsonb_build_object(
        'id', a.id, 'titel', a.titel, 'omschrijving', a.omschrijving, 'prijs', a.prijs, 'plaats', a.plaats,
        'levering', to_jsonb(array(select unnest(a.levering) intersect select unnest(array['verzenden', 'ophalen']))),
        'heeft_foto', private.heeft_foto(a.id),
        'voorraad', a.voorraad, 'uitverkocht', not a.actief or a.voorraad = 0) order by (not a.actief or a.voorraad = 0), a.id desc)
      from private.aanbod a
      where a.gebruiker_id = w.gebruiker_id and a.in_winkel and not a.geblokkeerd
        and (a.actief or a.voorraad is not null)), '[]'::jsonb));
end; $$;

create or replace function public.winkel_bekijken(p_adres text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare w private.winkels;
begin
  select * into w from private.winkels where adres = lower(trim(coalesce(p_adres, ''))) and open;
  if w.gebruiker_id is null or exists (select 1 from private.gebruikers where id = w.gebruiker_id
                                       and (geblokkeerd or verwijderd)) then
    return jsonb_build_object('fout', 'Deze winkel bestaat niet of is nu gesloten.');
  end if;
  return private.winkel_pagina(w);
end; $$;

-- Je eigen winkel zoals een koper hem ziet, ook als hij nog dicht is. Met de banner erbij.
create or replace function public.winkel_voorbeeld(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); w private.winkels;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into w from private.winkels where gebruiker_id = v_id;
  if w.gebruiker_id is null then return jsonb_build_object('fout', 'Je hebt nog geen winkel.'); end if;
  return private.winkel_pagina(w) || jsonb_build_object('banner', w.banner);
end; $$;

-- De bannerfoto apart, zodat de winkelpagina zelf klein en snel blijft.
create or replace function public.winkel_banner(p_adres text)
returns text language sql stable security definer set search_path to '' as $$
  select w.banner from private.winkels w
  where w.adres = lower(trim(coalesce(p_adres, ''))) and w.open
    and not exists (select 1 from private.gebruikers g where g.id = w.gebruiker_id and (g.geblokkeerd or g.verwijderd))
$$;

-- Opmaak bewaren. p_banner: null laat de foto staan, '' haalt hem weg, anders een foto (jpeg, png of webp, max 450 kB).
create or replace function public.winkel_opmaak_bewaren(p_naam text, p_wachtwoord text, p_opmaak jsonb, p_banner text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_opmaak jsonb;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if not exists (select 1 from private.winkels where gebruiker_id = v_id) then
    return jsonb_build_object('fout', 'Maak eerst je winkel.');
  end if;
  if p_banner is not null and p_banner <> '' and (p_banner !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$'
      or length(p_banner) > 450000) then
    return jsonb_build_object('fout', 'Deze foto past niet. Kies een andere.');
  end if;
  v_opmaak := private.opmaak_schoon(p_opmaak);
  -- Uitlichten kan alleen met je eigen producten die in je winkel staan.
  v_opmaak := jsonb_set(v_opmaak, '{uitgelicht}', coalesce((select jsonb_agg(a.id order by array_position(
      array(select (jsonb_array_elements_text(v_opmaak->'uitgelicht'))::bigint), a.id))
    from private.aanbod a where a.gebruiker_id = v_id and a.in_winkel
      and a.id in (select (jsonb_array_elements_text(v_opmaak->'uitgelicht'))::bigint)), '[]'::jsonb));
  update private.winkels set opmaak = v_opmaak,
    banner = case when p_banner is null then banner when p_banner = '' then null else p_banner end
  where gebruiker_id = v_id;
  return jsonb_build_object('ok', true, 'opmaak', v_opmaak);
end; $$;

-- Verwijdert iemand zijn account, dan gaan ook de opmaak en de bannerfoto van zijn winkel weg.
create or replace function private.winkel_opmaak_wissen()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  update private.winkels set opmaak = '{}'::jsonb, banner = null where gebruiker_id = new.id;
  return new;
end; $$;

create or replace trigger winkel_opmaak_wissen after update of verwijderd on private.gebruikers
  for each row when (new.verwijderd and not old.verwijderd) execute function private.winkel_opmaak_wissen();

revoke all on function private.winkel_opmaak_wissen() from public, anon, authenticated;
revoke all on function private.opmaak_schoon(jsonb) from public, anon, authenticated;
revoke all on function private.winkel_pagina(private.winkels) from public, anon, authenticated;
grant execute on function public.winkel_voorbeeld(text, text) to anon, authenticated;
grant execute on function public.winkel_banner(text) to anon, authenticated;
grant execute on function public.winkel_opmaak_bewaren(text, text, jsonb, text) to anon, authenticated;
