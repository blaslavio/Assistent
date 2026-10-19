-- Winkelkaart: een winkel in de app mag een vestiging hebben (adres + plek op de kaart).
-- Op de kaart staan alle winkels uit OpenStreetMap, maar winkels met een account bij ons gaan voor.
-- Alleen kolommen erbij; er wordt niets verwijderd.

alter table private.winkels add column if not exists winkeladres text not null default '';
alter table private.winkels add column if not exists lat double precision check (lat between -90 and 90);
alter table private.winkels add column if not exists lon double precision check (lon between -180 and 180);

create or replace function private.winkel_json(w private.winkels)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('adres', w.adres, 'naam', w.naam, 'omschrijving', w.omschrijving, 'kleur', w.kleur,
                            'verzendkosten', w.verzendkosten, 'gratis_vanaf', w.gratis_vanaf, 'retour', w.retour,
                            'open', w.open, 'winkeladres', w.winkeladres, 'lat', w.lat, 'lon', w.lon)
$$;

-- Vestiging instellen of weghalen (leeg adres = alleen online).
create or replace function public.winkel_vestiging(p_naam text, p_wachtwoord text, p_winkeladres text,
                                                   p_lat double precision, p_lon double precision)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_leeg boolean := trim(coalesce(p_winkeladres, '')) = '';
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if not v_leeg and (p_lat is null or p_lon is null or p_lat not between -90 and 90 or p_lon not between -180 and 180) then
    return jsonb_build_object('fout', 'Dit adres kan ik niet op de kaart vinden.');
  end if;
  update private.winkels set winkeladres = case when v_leeg then '' else left(trim(p_winkeladres), 200) end,
         lat = case when v_leeg then null else p_lat end, lon = case when v_leeg then null else p_lon end
  where gebruiker_id = v_id;
  if not found then return jsonb_build_object('fout', 'Maak eerst je winkel aan.'); end if;
  return jsonb_build_object('ok', true);
end; $$;

-- Account verwijderen: ook het winkeladres wissen.
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
  update private.winkels set open = false, omschrijving = '', retour = '', winkeladres = '', lat = null, lon = null where gebruiker_id = v_id;
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
revoke all on function public.winkel_vestiging(text, text, text, double precision, double precision) from public;
grant execute on function public.winkel_vestiging(text, text, text, double precision, double precision)
  to anon, authenticated;
