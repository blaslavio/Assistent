-- Winkelen: winkels en producten in de buurt, een winkelmand per winkel, bezorgen door restaurants en winkels,
-- en inkopen bij groothandels (alleen voor verkopers en ondernemers). Alles aanvullend: niets wordt verwijderd.

alter table private.winkels add column if not exists soort text not null default 'winkel'
  check (soort in ('winkel', 'restaurant', 'groothandel'));
alter table private.winkels add column if not exists bezorgen boolean not null default false;
alter table private.winkels add column if not exists bezorg_km numeric(4, 1) not null default 5 check (bezorg_km between 0.5 and 50);
alter table private.winkels add column if not exists bezorgkosten numeric(6, 2) not null default 0
  check (bezorgkosten between 0 and 50);
alter table private.winkels add column if not exists bezorg_minimum numeric(8, 2) not null default 0
  check (bezorg_minimum between 0 and 1000);
alter table private.winkels add column if not exists bezorg_minuten integer not null default 45
  check (bezorg_minuten between 10 and 240);
alter table private.winkels add column if not exists bezorg_van time;
alter table private.winkels add column if not exists bezorg_tot time;

-- Een bezorgbestelling heeft levering 'verzenden' met bezorgen = true (de winkel brengt het zelf).
alter table private.bestellingen add column if not exists bezorgen boolean not null default false;
alter table private.bestellingen add column if not exists bezorg_adres text not null default ''
  check (length(bezorg_adres) <= 300);
alter table private.bestellingen add column if not exists bezorg_stap text not null default ''
  check (bezorg_stap in ('', 'bereiden', 'onderweg'));
-- Meerdere producten in één bestelling (de winkelmand): [{id, titel, aantal, prijs}]. Leeg = alleen aanbod_id.
alter table private.bestellingen add column if not exists regels jsonb not null default '[]'::jsonb;

-- Afstand in km tussen twee punten (haversine).
create or replace function private.km(p_lat1 double precision, p_lon1 double precision, p_lat2 double precision,
                                      p_lon2 double precision)
returns double precision language sql immutable set search_path to '' as $$
  select case when p_lat1 is null or p_lon1 is null or p_lat2 is null or p_lon2 is null then null else
    12742 * asin(sqrt(power(sin(radians(p_lat2 - p_lat1) / 2), 2)
                      + cos(radians(p_lat1)) * cos(radians(p_lat2)) * power(sin(radians(p_lon2 - p_lon1) / 2), 2))) end
$$;

-- Bezorgt de winkel nu (binnen de bezorgtijden, Nederlandse tijd)?
create or replace function private.bezorgt_nu(w private.winkels)
returns boolean language sql stable set search_path to '' as $$
  select w.bezorgen and (w.bezorg_van is null or w.bezorg_tot is null
    or case when w.bezorg_van <= w.bezorg_tot
            then (now() at time zone 'Europe/Amsterdam')::time between w.bezorg_van and w.bezorg_tot
            else (now() at time zone 'Europe/Amsterdam')::time >= w.bezorg_van
                 or (now() at time zone 'Europe/Amsterdam')::time <= w.bezorg_tot end)
$$;

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
                            'bezorg_tot', to_char(w.bezorg_tot, 'HH24:MI'), 'bezorgt_nu', private.bezorgt_nu(w))
$$;

-- Mag deze gebruiker bij een groothandel kopen? Alleen verkopers, ondernemers en de beheerder.
create or replace function private.mag_inkopen(p_gebruiker bigint)
returns boolean language sql stable security definer set search_path to '' as $$
  select p_gebruiker = 1 or coalesce((select niveau in ('verkoper', 'ondernemer') from private.gebruikers
                                       where id = p_gebruiker), false)
$$;

-- Bezorging en soort winkel instellen (bij Mijn webshop). Bezorgen kan alleen met een winkeladres op de kaart.
create or replace function public.winkel_bezorging(p_naam text, p_wachtwoord text, p_soort text, p_bezorgen boolean,
                                                   p_km numeric, p_kosten numeric, p_minimum numeric, p_minuten integer,
                                                   p_van time, p_tot time)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); w private.winkels;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into w from private.winkels where gebruiker_id = v_id for update;
  if w.gebruiker_id is null then return jsonb_build_object('fout', 'Maak eerst je winkel aan.'); end if;
  if coalesce(p_soort, '') not in ('winkel', 'restaurant', 'groothandel') then
    return jsonb_build_object('fout', 'Kies het soort winkel.');
  end if;
  if p_soort = 'groothandel' and v_id <> 1
     and (select niveau from private.gebruikers where id = v_id) <> 'ondernemer' then
    return jsonb_build_object('fout', 'Een groothandel kan met accounttype Ondernemer.');
  end if;
  if coalesce(p_bezorgen, false) and w.lat is null then
    return jsonb_build_object('fout', 'Vul eerst het adres van je winkel in (Op de winkelkaart).');
  end if;
  if coalesce(p_km, 5) not between 0.5 and 50 or coalesce(p_kosten, 0) not between 0 and 50
     or coalesce(p_minimum, 0) not between 0 and 1000 or coalesce(p_minuten, 45) not between 10 and 240 then
    return jsonb_build_object('fout', 'Controleer de bezorginstellingen.');
  end if;
  update private.winkels set soort = p_soort, bezorgen = coalesce(p_bezorgen, false), bezorg_km = coalesce(p_km, 5),
         bezorgkosten = coalesce(p_kosten, 0), bezorg_minimum = coalesce(p_minimum, 0),
         bezorg_minuten = coalesce(p_minuten, 45), bezorg_van = p_van, bezorg_tot = p_tot
  where gebruiker_id = v_id;
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.winkel_bezorging(text, text, text, boolean, numeric, numeric, numeric, integer, time, time)
  to anon, authenticated;

-- Winkels in de buurt, dichtstbij eerst. Groothandels alleen voor wie mag inkopen (p_inkopen).
create or replace function public.winkelen_winkels(p_naam text, p_wachtwoord text, p_zoek text, p_lat double precision,
                                                   p_lon double precision, p_soort text, p_inkopen boolean)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_zoek text := trim(coalesce(p_zoek, ''));
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if coalesce(p_inkopen, false) and not private.mag_inkopen(v_id) then
    return jsonb_build_object('fout', 'Inkopen kan met accounttype Verkoper of Ondernemer.');
  end if;
  return jsonb_build_object('winkels', coalesce((select jsonb_agg(x order by (x->>'afstand_km')::float nulls last, x->>'naam')
    from (select private.winkel_json(w) || jsonb_build_object(
            'verkoper', private.weergave(w.gebruiker_id), 'vertrouwen', private.vertrouwen(w.gebruiker_id),
            'afstand_km', round(private.km(p_lat, p_lon, w.lat, w.lon)::numeric, 1),
            'bezorgt_hier', private.bezorgt_nu(w) and private.km(p_lat, p_lon, w.lat, w.lon) <= w.bezorg_km,
            'van_mij', w.gebruiker_id = v_id,
            'producten', (select count(*) from private.aanbod a where a.gebruiker_id = w.gebruiker_id and a.in_winkel
                          and not a.geblokkeerd and (a.actief or a.voorraad is not null) and coalesce(a.voorraad, 1) > 0)) as x
          from private.winkels w join private.gebruikers g on g.id = w.gebruiker_id
          where w.open and not g.geblokkeerd and not g.verwijderd
            and (case when coalesce(p_inkopen, false) then w.soort = 'groothandel' else w.soort <> 'groothandel' end)
            and (coalesce(p_soort, '') = '' or w.soort = p_soort)
            and (v_zoek = '' or w.naam ilike '%' || v_zoek || '%' or w.omschrijving ilike '%' || v_zoek || '%'
                 or exists (select 1 from private.aanbod a where a.gebruiker_id = w.gebruiker_id and a.in_winkel
                            and not a.geblokkeerd and a.titel ilike '%' || v_zoek || '%'))
          limit 200) s), '[]'::jsonb));
end; $$;
grant execute on function public.winkelen_winkels(text, text, text, double precision, double precision, text, boolean)
  to anon, authenticated;

-- Producten uit alle open winkels, dichtstbij eerst.
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
grant execute on function public.winkelen_producten(text, text, text, double precision, double precision, boolean)
  to anon, authenticated;

-- De winkelmand afrekenen: één bestelling met alle producten van één winkel.
-- p_regels = [{"id": aanbod_id, "aantal": n}]. p_levering = verzenden, ophalen of bezorgen.
-- Bij een restaurant is een gerecht zonder voorraad gewoon altijd te bestellen; elders is dat één los stuk.
create or replace function public.winkel_afrekenen(p_naam text, p_wachtwoord text, p_winkel text, p_regels jsonb,
                                                   p_levering text, p_adres text, p_lat double precision,
                                                   p_lon double precision, p_bericht text, p_code text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); w private.winkels; r jsonb; v_a private.aanbod;
  v_regels jsonb := '[]'::jsonb; v_sub numeric := 0; v_aantal integer; v_totaal integer := 0; v_verzend numeric := 0;
  v_bedrag numeric; v_best bigint; v_eerste bigint; v_titel text := ''; v_afstand double precision; k record;
  v_levering text := lower(coalesce(p_levering, ''));
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  perform private.webshop_opruimen();
  select * into w from private.winkels where adres = lower(trim(coalesce(p_winkel, ''))) and open;
  if w.gebruiker_id is null or exists (select 1 from private.gebruikers where id = w.gebruiker_id
                                       and (geblokkeerd or verwijderd)) then
    return jsonb_build_object('fout', 'Deze winkel is nu gesloten.');
  end if;
  if w.gebruiker_id = v_id then return jsonb_build_object('fout', 'Dit is je eigen winkel.'); end if;
  if w.soort = 'groothandel' and not private.mag_inkopen(v_id) then
    return jsonb_build_object('fout', 'Bij een groothandel kopen kan met accounttype Verkoper of Ondernemer.');
  end if;
  if v_id <> 1 and not exists (select 1 from private.gebruikers where id = v_id and email is not null) then
    return jsonb_build_object('fout', 'Vul eerst je mailadres in bij Instellingen › Account.');
  end if;
  if not private.winkel_kan_betalen(w.gebruiker_id) then
    return jsonb_build_object('fout', 'Deze winkel kan nu geen betalingen ontvangen. Probeer het later opnieuw.');
  end if;
  if jsonb_typeof(p_regels) <> 'array' or jsonb_array_length(p_regels) = 0 then
    return jsonb_build_object('fout', 'Je mandje is leeg.');
  end if;
  if jsonb_array_length(p_regels) > 30 then return jsonb_build_object('fout', 'Hooguit 30 producten per bestelling.'); end if;
  if v_levering not in ('verzenden', 'ophalen', 'bezorgen') then
    return jsonb_build_object('fout', 'Kies hoe je het krijgt.');
  end if;
  if v_levering = 'bezorgen' then
    if not w.bezorgen then return jsonb_build_object('fout', 'Deze winkel bezorgt niet.'); end if;
    if not private.bezorgt_nu(w) then
      return jsonb_build_object('fout', format('Bezorgen kan van %s tot %s.', to_char(w.bezorg_van, 'HH24:MI'),
                                               to_char(w.bezorg_tot, 'HH24:MI')));
    end if;
    if coalesce(trim(p_adres), '') = '' or p_lat is null or p_lon is null then
      return jsonb_build_object('fout', 'Vul je bezorgadres in.');
    end if;
    v_afstand := private.km(p_lat, p_lon, w.lat, w.lon);
    if v_afstand is null or v_afstand > w.bezorg_km then
      return jsonb_build_object('fout', format('Dit adres ligt buiten het bezorggebied (%s km).',
                                               replace(w.bezorg_km::text, '.', ',')));
    end if;
  end if;
  if (select count(*) from private.bestellingen where koper = v_id and status in ('aangevraagd', 'geaccepteerd'))
     >= (case when (select aangemaakt > now() - interval '7 days' from private.gebruikers where id = v_id) then 3 else 10 end) then
    return jsonb_build_object('fout', 'Je hebt al veel openstaande bestellingen. Rond die eerst af of annuleer ze.');
  end if;
  for r in select * from jsonb_array_elements(p_regels) loop
    v_aantal := coalesce((r->>'aantal')::integer, 1);
    select * into v_a from private.aanbod where id = (r->>'id')::bigint and gebruiker_id = w.gebruiker_id
      and in_winkel and not geblokkeerd for update;
    if v_a.id is null or (not v_a.actief and v_a.voorraad is null) then
      return jsonb_build_object('fout', 'Een product in je mandje is niet meer te koop.');
    end if;
    if v_aantal not between 1 and 99 then return jsonb_build_object('fout', 'Kies een aantal van 1 tot 99.'); end if;
    if v_levering <> 'bezorgen' and not v_levering = any(v_a.levering) then
      return jsonb_build_object('fout', format('%s kan niet %s worden.', v_a.titel,
                                               case v_levering when 'ophalen' then 'opgehaald' else 'verzonden' end));
    end if;
    if v_a.voorraad is null and w.soort <> 'restaurant' then
      if v_aantal > 1 then return jsonb_build_object('fout', format('Van %s is er maar één.', v_a.titel)); end if;
      if exists (select 1 from private.bestellingen where status in ('aangevraagd', 'geaccepteerd', 'betaald', 'geleverd')
                 and (aanbod_id = v_a.id or regels @> jsonb_build_array(jsonb_build_object('id', v_a.id)))) then
        return jsonb_build_object('fout', format('Iemand anders is %s net aan het kopen.', v_a.titel));
      end if;
    elsif v_a.voorraad is not null and v_a.voorraad < v_aantal then
      return jsonb_build_object('fout', case when v_a.voorraad = 0 then format('%s is uitverkocht.', v_a.titel)
                                             else format('Van %s zijn er nog %s.', v_a.titel, v_a.voorraad) end);
    end if;
    if v_regels @> jsonb_build_array(jsonb_build_object('id', v_a.id)) then
      return jsonb_build_object('fout', 'Een product staat dubbel in je mandje.');
    end if;
    v_regels := v_regels || jsonb_build_array(jsonb_build_object('id', v_a.id, 'titel', v_a.titel, 'aantal', v_aantal,
                                                                 'prijs', v_a.prijs));
    v_sub := v_sub + coalesce(v_a.prijs, 0) * v_aantal;
    v_totaal := v_totaal + v_aantal;
    v_eerste := coalesce(v_eerste, v_a.id);
    v_titel := v_titel || case when v_titel = '' then '' else ', ' end
               || case when v_aantal > 1 then v_aantal || '× ' else '' end || v_a.titel;
  end loop;
  if v_levering = 'bezorgen' and v_sub < w.bezorg_minimum then
    return jsonb_build_object('fout', format('Bezorgen kan vanaf € %s.', replace(to_char(w.bezorg_minimum, 'FM999990.00'), '.', ',')));
  end if;
  select * into k from private.korting_berekenen(w.gebruiker_id, p_code, v_sub);
  if k.fout is not null then return jsonb_build_object('fout', k.fout); end if;
  v_verzend := case when v_levering = 'bezorgen' then w.bezorgkosten
                    when v_levering = 'verzenden' and not (w.gratis_vanaf is not null and v_sub >= w.gratis_vanaf)
                      then w.verzendkosten else 0 end;
  v_bedrag := v_sub - k.korting + v_verzend;
  if v_bedrag < 1 then return jsonb_build_object('fout', 'Betalen via de app kan vanaf 1 euro.'); end if;
  for r in select * from jsonb_array_elements(v_regels) loop
    update private.aanbod set voorraad = voorraad - (r->>'aantal')::integer
    where id = (r->>'id')::bigint and voorraad is not null;
  end loop;
  if k.code_id is not null then update private.kortingscodes set gebruikt = gebruikt + 1 where id = k.code_id; end if;
  insert into private.bestellingen (aanbod_id, koper, verkoper, titel, bedrag, betaalwijze, levering, status, webshop,
                                    aantal, verzendkosten, commissie, kosten, korting, kortingscode, bezorgen,
                                    bezorg_adres, regels, bezorgen_van, bezorgen_tot)
  values (v_eerste, v_id, w.gebruiker_id, left(v_titel, 200), v_bedrag, 'app',
          case when v_levering = 'ophalen' then 'ophalen' else 'verzenden' end, 'geaccepteerd', true,
          least(v_totaal, 99), v_verzend, private.commissie(v_bedrag), 0, k.korting,
          case when k.code_id is null then '' else upper(trim(p_code)) end, v_levering = 'bezorgen',
          case when v_levering = 'bezorgen' then left(trim(p_adres), 300) else '' end, v_regels, null, null)
  returning id into v_best;
  perform private.bericht(v_eerste, v_id, w.gebruiker_id,
    format('Bestelling: %s. %s', left(v_titel, 500),
           case v_levering when 'bezorgen' then 'Bezorgen op ' || left(trim(p_adres), 300) || '.'
                           when 'ophalen' then 'Ophalen.' else 'Verzenden.' end) ||
    case when k.korting > 0 then format(' Kortingscode %s: -€ %s.', upper(trim(p_code)),
                                        replace(to_char(k.korting, 'FM999990.00'), '.', ',')) else '' end ||
    case when coalesce(trim(p_bericht), '') <> '' then ' ' || left(trim(p_bericht), 1000) else '' end);
  return jsonb_build_object('ok', true, 'id', v_best, 'bedrag', v_bedrag, 'verzendkosten', v_verzend,
                            'korting', k.korting);
end; $$;
grant execute on function public.winkel_afrekenen(text, text, text, jsonb, text, text, double precision, double precision,
                                                  text, text) to anon, authenticated;

-- De winkel geeft de stand van een bezorging door: bereiden → onderweg → bezorgd. De koper krijgt een bericht.
create or replace function public.bezorging_bijwerken(p_naam text, p_wachtwoord text, p_id bigint, p_stap text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); b private.bestellingen; w_minuten integer;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into b from private.bestellingen where id = p_id and verkoper = v_id and bezorgen for update;
  if b.id is null then return jsonb_build_object('fout', 'Bestelling niet gevonden.'); end if;
  w_minuten := coalesce((select bezorg_minuten from private.winkels where gebruiker_id = v_id), 45);
  if b.status <> 'betaald' then return jsonb_build_object('fout', 'Dit kan zodra de klant heeft betaald.'); end if;
  if p_stap = 'bereiden' and b.bezorg_stap = '' then
    update private.bestellingen set bezorg_stap = 'bereiden', bijgewerkt = now(),
           bezorgen_van = now() + make_interval(mins => greatest(w_minuten - 10, 5)),
           bezorgen_tot = now() + make_interval(mins => w_minuten + 10)
    where id = p_id;
    perform private.bericht(b.aanbod_id, v_id, b.koper, 'Je bestelling wordt klaargemaakt.');
  elsif p_stap = 'onderweg' and b.bezorg_stap in ('', 'bereiden') then
    update private.bestellingen set bezorg_stap = 'onderweg', bijgewerkt = now(),
           bezorgen_van = now() + interval '5 minutes', bezorgen_tot = now() + interval '30 minutes'
    where id = p_id;
    perform private.bericht(b.aanbod_id, v_id, b.koper, 'Je bestelling is onderweg.');
  elsif p_stap = 'bezorgd' then
    update private.bestellingen set status = 'geleverd', bijgewerkt = now() where id = p_id;
    perform private.bericht(b.aanbod_id, v_id, b.koper,
                            'Bezorgd. Laat je weten of alles goed is ontvangen? Dan gaat de betaling naar de winkel.');
  else
    return jsonb_build_object('fout', 'Dat kan nu niet bij deze bestelling.');
  end if;
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.bezorging_bijwerken(text, text, bigint, text) to anon, authenticated;

-- Bij annuleren komt de voorraad van alle producten in de mand terug.
create or replace function private.voorraad_terug()
returns trigger language plpgsql security definer set search_path to '' as $$
declare r jsonb;
begin
  if new.webshop and new.status = 'geannuleerd' and old.status <> 'geannuleerd' then
    if jsonb_array_length(new.regels) > 0 then
      for r in select * from jsonb_array_elements(new.regels) loop
        update private.aanbod set voorraad = voorraad + (r->>'aantal')::integer
        where id = (r->>'id')::bigint and voorraad is not null;
      end loop;
    else
      update private.aanbod set voorraad = voorraad + new.aantal where id = new.aanbod_id and voorraad is not null;
    end if;
    if new.kortingscode <> '' then
      update private.kortingscodes set gebruikt = greatest(gebruikt - 1, 0)
      where verkoper = new.verkoper and code = new.kortingscode;
    end if;
  end if;
  return new;
end; $$;

-- Een los stuk is na de verkoop weg; een gerecht van een restaurant blijft op de kaart.
create or replace function private.verkocht_weg(b private.bestellingen)
returns void language sql security definer set search_path to '' as $$
  update private.aanbod a set actief = false
  where a.soort = 'product' and a.voorraad is null
    and (a.id = b.aanbod_id or b.regels @> jsonb_build_array(jsonb_build_object('id', a.id)))
    and not exists (select 1 from private.winkels w where w.gebruiker_id = b.verkoper and w.soort = 'restaurant'
                    and a.in_winkel)
$$;

create or replace function public.stripe_vrijgeven(p_id bigint, p_door bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare b private.bestellingen;
begin
  update private.bestellingen set status = 'afgerond', bijgewerkt = now()
  where id = p_id and betaalwijze = 'app' and not uitbetaald
    and ((koper = p_door and status in ('betaald', 'geleverd')) or (p_door = 1 and status = 'geschil'))
  returning * into b;
  if b.id is null then return null; end if;
  perform private.bericht(b.aanbod_id, b.koper, b.verkoper, 'Alles goed ontvangen, bedankt! De betaling wordt aan je uitbetaald.');
  perform private.verkocht_weg(b);
  return jsonb_build_object('bedrag', b.bedrag, 'verkoper', b.verkoper, 'stripe_betaling', b.stripe_betaling);
end; $$;

create or replace function public.bestelling_bijwerken(p_naam text, p_wachtwoord text, p_id bigint, p_actie text, p_toelichting text)
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
      when p_actie = 'ontvangen' and b.status in ('betaald', 'geleverd') and b.betaalwijze <> 'app' then 'afgerond'
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
  if v_nieuw = 'afgerond' then
    perform private.verkocht_weg(b);
  end if;
  return jsonb_build_object('ok', true, 'status', v_nieuw);
end; $$;

-- Een bezorging heeft geen track en trace.
create or replace function public.bestelling_verzending(p_naam text, p_wachtwoord text, p_id bigint, p_vervoerder text,
                                                        p_code text, p_van timestamptz, p_tot timestamptz)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); b private.bestellingen; v_tekst text;
  v_code text := left(trim(coalesce(p_code, '')), 300); v_vervoerder text := lower(coalesce(p_vervoerder, ''));
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into b from private.bestellingen where id = p_id and (koper = v_id or verkoper = v_id) for update;
  if b.id is null then return jsonb_build_object('fout', 'Bestelling niet gevonden.'); end if;
  if b.levering <> 'verzenden' or b.bezorgen then
    return jsonb_build_object('fout', 'Deze bestelling wordt niet verzonden.');
  end if;
  if b.status not in ('betaald', 'geleverd') and not (b.status = 'geaccepteerd' and b.betaalwijze <> 'app') then
    return jsonb_build_object('fout', 'Dat kan nu niet bij deze bestelling.');
  end if;
  if p_van is not null and (p_tot is null or p_tot < p_van or p_tot > p_van + interval '1 day'
                            or p_van < now() - interval '1 day' or p_van > now() + interval '60 days') then
    return jsonb_build_object('fout', 'Kies een geldig bezorgmoment.');
  end if;
  if v_id = b.verkoper then
    if v_vervoerder not in ('', 'postnl', 'dhl', 'dpd', 'gls', 'ups', 'anders') then
      return jsonb_build_object('fout', 'Kies een vervoerder.');
    end if;
    if v_code = '' and p_van is null then return jsonb_build_object('fout', 'Vul de track-en-tracecode in.'); end if;
    update private.bestellingen set vervoerder = case when v_code <> '' then v_vervoerder else vervoerder end,
           track_code = case when v_code <> '' then v_code else track_code end,
           bezorgen_van = coalesce(p_van, bezorgen_van), bezorgen_tot = coalesce(p_tot, bezorgen_tot), bijgewerkt = now()
    where id = p_id;
  else
    if p_van is null then return jsonb_build_object('fout', 'Kies een bezorgmoment.'); end if;
    update private.bestellingen set bezorgen_van = p_van, bezorgen_tot = p_tot, bijgewerkt = now() where id = p_id;
  end if;
  v_tekst := concat_ws(' ',
    case when v_id = b.verkoper and v_code <> '' then 'Verzonden. Track en trace: ' || v_code || '.' end,
    case when p_van is not null then 'Verwacht: ' || to_char(p_van at time zone 'Europe/Amsterdam', 'DD-MM HH24:MI')
                                     || '-' || to_char(p_tot at time zone 'Europe/Amsterdam', 'HH24:MI') || '.' end);
  perform private.bericht(b.aanbod_id, v_id, case when v_id = b.koper then b.verkoper else b.koper end, v_tekst);
  return jsonb_build_object('ok', true);
end; $$;

create or replace function public.mijn_bestellingen(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  perform private.webshop_opruimen();
  return jsonb_build_object('bestellingen', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', b.id, 'aanbod_id', b.aanbod_id, 'titel', b.titel, 'bedrag', b.bedrag, 'betaalwijze', b.betaalwijze,
      'kosten', case when b.betaalwijze = 'app' then coalesce(b.kosten, private.kosten(b.bedrag)) end,
      'levering', case when b.bezorgen then 'bezorgen' else b.levering end, 'status', b.status,
      'aangemaakt', b.aangemaakt, 'bijgewerkt', b.bijgewerkt,
      'uitbetaald', b.uitbetaald, 'webshop', b.webshop, 'aantal', b.aantal, 'verzendkosten', b.verzendkosten,
      'commissie', case when b.verkoper = v_id then b.commissie end,
      'rol', case when b.koper = v_id then 'koper' else 'verkoper' end,
      'ander_id', case when b.koper = v_id then b.verkoper else b.koper end,
      'ander', private.weergave(case when b.koper = v_id then b.verkoper else b.koper end),
      'vertrouwen_ander', private.vertrouwen(case when b.koper = v_id then b.verkoper else b.koper end),
      'vervoerder', b.vervoerder, 'track_code', b.track_code, 'bezorgen_van', b.bezorgen_van,
      'bezorgen_tot', b.bezorgen_tot, 'bezorg_adres', b.bezorg_adres, 'bezorg_stap', b.bezorg_stap,
      'regels', b.regels,
      'beoordeeld', exists (select 1 from private.beoordelingen r where r.bestelling_id = b.id and r.door = v_id))
      order by b.bijgewerkt desc)
    from private.bestellingen b
    where (b.koper = v_id or b.verkoper = v_id)
      and (b.status not in ('afgerond', 'geannuleerd', 'terugbetaald') or b.bijgewerkt > now() - interval '60 days')),
    '[]'::jsonb));
end; $$;
