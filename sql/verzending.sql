-- Verzending: track en trace en het verwachte bezorgmoment bij een bestelling, en reviews die alleen de verkoper leest.

alter table private.bestellingen add column if not exists vervoerder text not null default ''
  check (vervoerder in ('', 'postnl', 'dhl', 'dpd', 'gls', 'ups', 'anders'));
alter table private.bestellingen add column if not exists track_code text not null default ''
  check (length(track_code) <= 300);
alter table private.bestellingen add column if not exists bezorgen_van timestamptz;
alter table private.bestellingen add column if not exists bezorgen_tot timestamptz;

-- De verkoper vult vervoerder en code in (en eventueel het bezorgmoment); de koper kan alleen het bezorgmoment
-- aanpassen, bijvoorbeeld als de vervoerder een tijdvak doorgeeft. De ander krijgt er een bericht over.
create or replace function public.bestelling_verzending(p_naam text, p_wachtwoord text, p_id bigint, p_vervoerder text,
                                                        p_code text, p_van timestamptz, p_tot timestamptz)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); b private.bestellingen; v_tekst text;
  v_code text := left(trim(coalesce(p_code, '')), 300); v_vervoerder text := lower(coalesce(p_vervoerder, ''));
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into b from private.bestellingen where id = p_id and (koper = v_id or verkoper = v_id) for update;
  if b.id is null then return jsonb_build_object('fout', 'Bestelling niet gevonden.'); end if;
  if b.levering <> 'verzenden' then return jsonb_build_object('fout', 'Deze bestelling wordt niet verzonden.'); end if;
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
grant execute on function public.bestelling_verzending(text, text, bigint, text, text, timestamptz, timestamptz)
  to anon, authenticated;

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
      'levering', b.levering, 'status', b.status, 'aangemaakt', b.aangemaakt, 'bijgewerkt', b.bijgewerkt,
      'uitbetaald', b.uitbetaald, 'webshop', b.webshop, 'aantal', b.aantal, 'verzendkosten', b.verzendkosten,
      'commissie', case when b.verkoper = v_id then b.commissie end,
      'rol', case when b.koper = v_id then 'koper' else 'verkoper' end,
      'ander_id', case when b.koper = v_id then b.verkoper else b.koper end,
      'ander', private.weergave(case when b.koper = v_id then b.verkoper else b.koper end),
      'vertrouwen_ander', private.vertrouwen(case when b.koper = v_id then b.verkoper else b.koper end),
      'vervoerder', b.vervoerder, 'track_code', b.track_code, 'bezorgen_van', b.bezorgen_van,
      'bezorgen_tot', b.bezorgen_tot,
      'beoordeeld', exists (select 1 from private.beoordelingen r where r.bestelling_id = b.id and r.door = v_id))
      order by b.bijgewerkt desc)
    from private.bestellingen b
    where (b.koper = v_id or b.verkoper = v_id)
      and (b.status not in ('afgerond', 'geannuleerd', 'terugbetaald') or b.bijgewerkt > now() - interval '60 days')),
    '[]'::jsonb));
end; $$;

-- Reviews zijn alleen voor de verkoper leesbaar (bij Mijn webshop); anderen zien alleen de sterren.
create or replace function public.reviews_bekijken(p_adres text)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object(
    'sterren', (select round(avg(r.sterren), 1) from private.reviews_over(w.gebruiker_id) r),
    'aantal', (select count(*) from private.reviews_over(w.gebruiker_id) r),
    'verdeling', (select jsonb_object_agg(s, n) from (select r.sterren as s, count(*) as n
                  from private.reviews_over(w.gebruiker_id) r group by r.sterren) x),
    'reviews', '[]'::jsonb)
  from private.winkels w where w.adres = lower(trim(coalesce(p_adres, '')))
$$;
