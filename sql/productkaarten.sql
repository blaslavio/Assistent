-- Een foto bij een product of aanbod. Apart van private.aanbod, zodat lijsten en zoekresultaten klein blijven:
-- die zeggen alleen of er een foto is ('heeft_foto'); de foto zelf haal je per product op als je hem echt ziet.

create table if not exists private.aanbod_fotos (
  aanbod bigint primary key references private.aanbod(id),
  foto text,
  gewijzigd timestamptz not null default now()
);
alter table private.aanbod_fotos enable row level security;

create or replace function private.heeft_foto(p_aanbod bigint)
returns boolean language sql stable security definer set search_path to '' as $$
  select exists (select 1 from private.aanbod_fotos f where f.aanbod = p_aanbod and f.foto is not null)
$$;

-- Alleen de eigenaar zet of haalt een foto weg. Leeg = weghalen.
create or replace function public.aanbod_foto_zetten(p_naam text, p_wachtwoord text, p_aanbod bigint, p_foto text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_foto text := nullif(trim(coalesce(p_foto, '')), '');
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if not exists (select 1 from private.aanbod where id = p_aanbod and gebruiker_id = v_id) then
    return jsonb_build_object('fout', 'Dit product is niet van jou.');
  end if;
  if v_foto is not null and (length(v_foto) > 400000
      or v_foto !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$') then
    return jsonb_build_object('fout', 'Deze foto kan niet. Kies een kleinere jpg, png of webp.');
  end if;
  insert into private.aanbod_fotos (aanbod, foto) values (p_aanbod, v_foto)
  on conflict (aanbod) do update set foto = excluded.foto, gewijzigd = now();
  return jsonb_build_object('ok', true);
end; $$;

-- Welke van mijn producten hebben een foto (voor de beheerschermen).
create or replace function public.mijn_productfotos(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object('ids', coalesce((select jsonb_agg(f.aanbod order by f.aanbod)
    from private.aanbod_fotos f join private.aanbod a on a.id = f.aanbod
    where a.gebruiker_id = v_id and f.foto is not null), '[]'::jsonb));
end; $$;

-- De foto van een product dat iedereen mag zien: niet geblokkeerd, en online op de marktplaats of in een open winkel.
create or replace function public.product_foto(p_aanbod bigint)
returns text language sql stable security definer set search_path to '' as $$
  select f.foto from private.aanbod_fotos f
  join private.aanbod a on a.id = f.aanbod
  join private.gebruikers g on g.id = a.gebruiker_id
  where f.aanbod = p_aanbod and not a.geblokkeerd and not g.geblokkeerd and not g.verwijderd
    and (a.actief or (a.in_winkel and exists (select 1 from private.winkels w where w.gebruiker_id = a.gebruiker_id and w.open)))
$$;

create or replace function private.aanbod_json(a private.aanbod, p_ik bigint)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object(
    'id', a.id, 'soort', a.soort, 'titel', a.titel, 'omschrijving', a.omschrijving, 'prijs', a.prijs,
    'prijs_per', a.prijs_per, 'plaats', a.plaats, 'contact', a.contact, 'actief', a.actief,
    'betaalwijzen', to_jsonb(a.betaalwijzen), 'levering', to_jsonb(a.levering),
    'aanbieder', private.weergave(a.gebruiker_id), 'aanbieder_id', a.gebruiker_id, 'van_mij', a.gebruiker_id = p_ik,
    'vertrouwen', private.vertrouwen(a.gebruiker_id), 'aangemaakt', a.aangemaakt,
    'in_winkel', a.in_winkel, 'voorraad', a.voorraad,
    'winkel', case when a.in_winkel then (select w.adres from private.winkels w
                                         where w.gebruiker_id = a.gebruiker_id and w.open) end,
    'heeft_foto', private.heeft_foto(a.id),
    'vrije_tijden', (select count(*) from private.tijdsloten t
                     where t.aanbod_id = a.id and t.geboekt_door is null and not t.geannuleerd and t.start > now()))
$$;

create or replace function public.winkelen_producten(p_naam text, p_wachtwoord text, p_zoek text, p_lat double precision,
                                                     p_lon double precision, p_inkopen boolean)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_zoek text := trim(coalesce(p_zoek, ''));
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if coalesce(p_inkopen, false) and not private.mag_inkopen(v_id) then
    return jsonb_build_object('fout', 'Inkopen kan met accounttype Verkoper of Ondernemer.');
  end if;
  return jsonb_build_object('producten', coalesce((select jsonb_agg(x order by (x->>'afstand_km')::float nulls last, x->>'prijs')
    from (select jsonb_build_object(
            'id', a.id, 'titel', a.titel, 'omschrijving', left(a.omschrijving, 300), 'prijs', a.prijs,
            'voorraad', a.voorraad, 'levering', to_jsonb(array(select unnest(a.levering) intersect
                                                               select unnest(array['verzenden', 'ophalen']))),
            'winkel', w.adres, 'winkelnaam', w.naam, 'kleur', w.kleur, 'soort', w.soort,
            'heeft_foto', private.heeft_foto(a.id),
            'afstand_km', round(private.km(p_lat, p_lon, w.lat, w.lon)::numeric, 1),
            'bezorgt_hier', private.bezorgt_nu(w) and private.km(p_lat, p_lon, w.lat, w.lon) <= w.bezorg_km) as x
          from private.aanbod a join private.winkels w on w.gebruiker_id = a.gebruiker_id
          join private.gebruikers g on g.id = w.gebruiker_id
          where w.open and not g.geblokkeerd and not g.verwijderd and a.in_winkel and not a.geblokkeerd
            and (a.actief or a.voorraad is not null) and coalesce(a.voorraad, 1) > 0
            and (case when coalesce(p_inkopen, false) then w.soort = 'groothandel' else w.soort <> 'groothandel' end)
            and (v_zoek = '' or a.titel ilike '%' || v_zoek || '%' or a.omschrijving ilike '%' || v_zoek || '%')
          limit 200) s), '[]'::jsonb));
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

-- De pagina van een verkoper op de marktplaats: naam, vertrouwen, eventuele winkel en wat hij nu aanbiedt.
create or replace function public.verkoper_bekijken(p_naam text, p_wachtwoord text, p_verkoper bigint)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_profiel jsonb := private.openbaar_profiel(p_verkoper);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if v_profiel is null then return jsonb_build_object('fout', 'Deze verkoper bestaat niet (meer).'); end if;
  return jsonb_build_object('naam', v_profiel->>'naam', 'winkel', v_profiel->'winkel',
    'vertrouwen', private.vertrouwen(p_verkoper),
    'aanbod', coalesce((select jsonb_agg(private.aanbod_json(a, v_id) order by a.aangemaakt desc)
      from (select * from private.aanbod a where a.gebruiker_id = p_verkoper and a.actief and not a.geblokkeerd
            order by a.aangemaakt desc limit 30) a), '[]'::jsonb));
end; $$;

revoke all on function private.heeft_foto(bigint) from public, anon, authenticated;
grant execute on function public.product_foto(bigint) to anon, authenticated;
grant execute on function public.aanbod_foto_zetten(text, text, bigint, text) to anon, authenticated;
grant execute on function public.mijn_productfotos(text, text) to anon, authenticated;
grant execute on function public.verkoper_bekijken(text, text, bigint) to anon, authenticated;
