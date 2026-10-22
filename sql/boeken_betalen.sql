-- Betalen bij het boeken via de app (Stripe Connect), met annuleringsregels. Bouwt op sql/chat_boeken.sql en
-- sql/stripe.sql.
--
-- De aanbieder zet "Klanten betalen vooraf via de app" aan (kan alleen als Stripe zijn identiteit heeft gecontroleerd).
-- De klant boekt en betaalt binnen 30 minuten; de betaling is meteen de bevestiging. Het geld blijft bij Stripe tot na
-- de afspraak (afgevinkt, of een dag na afloop) en gaat dan naar de aanbieder, min de commissie (5%, minimaal € 0,35).
-- Annuleert de klant op tijd (standaard tot 24 uur vooraf), dan krijgt hij alles terug. Later krijgt de aanbieder het
-- ingestelde deel (standaard 50%) en de klant de rest. Annuleert of weigert de aanbieder, dan krijgt de klant alles terug.
-- Wie niet komt zonder af te zeggen, betaalt de volle prijs.
-- Wie liever zelf geld regelt, houdt IBAN of betaallink: dat werkt zoals het was.

alter table private.boekpaginas add column if not exists app_betalen boolean not null default false;
alter table private.boekpaginas add column if not exists annuleren jsonb not null default '{"uren": 24, "procent": 50}'::jsonb;

-- geld: null = niet via de app, open = wacht op betaling, betaald = geld staat bij Stripe,
-- verrekenen = klaar om terug te betalen en/of uit te betalen, verrekend = afgerond.
alter table private.boekingen add column if not exists geld text
  check (geld in ('open', 'betaald', 'verrekenen', 'verrekend'));
alter table private.boekingen add column if not exists betaal_tot timestamptz;
alter table private.boekingen add column if not exists betaal_sessie text;
alter table private.boekingen add column if not exists betaal_intent text;
alter table private.boekingen add column if not exists geld_terug integer not null default 0;
alter table private.boekingen add column if not exists geld_aan integer not null default 0;
alter table private.boekingen add column if not exists verrekend_op timestamptz;
alter table private.boekingen add column if not exists teruggestort timestamptz;
create index if not exists boekingen_geld on private.boekingen (geld) where geld in ('open', 'betaald', 'verrekenen');
create index if not exists boekingen_sessie on private.boekingen (betaal_sessie) where betaal_sessie is not null;

create or replace function private.annuleer_regel(p jsonb)
returns jsonb language sql immutable set search_path to '' as $$
  select jsonb_build_object(
    'uren', case when coalesce(p ->> 'uren', '') ~ '^\d{1,3}$' then least(168, (p ->> 'uren')::int) else 24 end,
    'procent', case when coalesce(p ->> 'procent', '') ~ '^\d{1,3}$' then least(100, (p ->> 'procent')::int) else 50 end)
$$;

-- Hoeveel de klant terugkrijgt als een betaalde boeking vervalt. Door de aanbieder: altijd alles.
create or replace function private.terug_bij_annuleren(p_aanbieder bigint, p_prijs integer, p_start timestamptz,
                                                       p_door_klant boolean)
returns integer language sql stable security definer set search_path to '' as $$
  select case when not p_door_klant then p_prijs
    when p_start - now() >= make_interval(hours => (r ->> 'uren')::int) then p_prijs
    else p_prijs - round(p_prijs * (r ->> 'procent')::int / 100.0)::int end
  from (select private.annuleer_regel(coalesce((select annuleren from private.boekpaginas where gebruiker_id = p_aanbieder),
                                               '{}'::jsonb)) r) x
$$;

-- Niet betaald binnen de tijd: de boeking vervalt en het moment komt weer vrij.
create or replace function private.boekingen_verlopen()
returns void language sql security definer set search_path to '' as $$
  update private.boekingen set status = 'geannuleerd', geld = null, verwerkt = afspraak_id is null
  where geld = 'open' and betaal_tot < now() and status in ('aangevraagd', 'bevestigd')
$$;

create or replace function private.boek_bezet(p_gebruiker bigint, p_van timestamptz, p_tot timestamptz, p_buffer integer)
returns boolean language sql stable security definer set search_path to '' as $$
  select exists (
    select 1 from public.gegevens g, jsonb_array_elements(coalesce(g.data -> 'afspraken', '[]'::jsonb)) a
    where g.id = p_gebruiker and coalesce(a ->> 'start', '') ~ '^\d{4}-\d{2}-\d{2}'
      and case when (a ->> 'start') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}' then
            (left(a ->> 'start', 16)::timestamp at time zone 'Europe/Amsterdam') < p_tot + make_interval(mins => p_buffer)
            and (case when coalesce(a ->> 'einde', '') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}'
                      then left(a ->> 'einde', 16)::timestamp at time zone 'Europe/Amsterdam'
                      else (left(a ->> 'start', 16)::timestamp at time zone 'Europe/Amsterdam') + interval '1 hour' end)
                > p_van - make_interval(mins => p_buffer)
          else coalesce(a ->> 'soort', '') = 'reizen'
            and left(a ->> 'start', 10)::date = (p_van at time zone 'Europe/Amsterdam')::date end)
  or exists (
    select 1 from private.boekingen b
    where b.gebruiker_id = p_gebruiker and b.status in ('aangevraagd', 'bevestigd')
      and not (b.geld is not distinct from 'open' and b.betaal_tot < now())
      and b.start < p_tot + make_interval(mins => p_buffer)
      and b.start + make_interval(mins => b.minuten) > p_van - make_interval(mins => p_buffer))
$$;

create or replace function private.boek_momenten(p private.boekpaginas, p_datum date, p_minuten integer)
returns setof timestamptz language sql stable security definer set search_path to '' as $$
  select m from (
    select distinct (t at time zone 'Europe/Amsterdam') m
    from jsonb_array_elements(coalesce(p.uren -> extract(isodow from p_datum)::text, '[]'::jsonb)) b,
         generate_series(p_datum + (b ->> 0)::time, p_datum + (b ->> 1)::time - make_interval(mins => p_minuten),
                         make_interval(mins => case when p_minuten < 30 then 15 else 30 end)) t
    where jsonb_typeof(b) = 'array' and jsonb_array_length(b) = 2
      and (b ->> 0) ~ '^\d{1,2}:\d{2}$' and (b ->> 1) ~ '^\d{1,2}:\d{2}$') x
  where m >= now() + make_interval(hours => p.min_vooraf) and m <= now() + make_interval(days => p.vooruit)
    and (select count(*) from private.boekingen b where b.gebruiker_id = p.gebruiker_id
         and b.status in ('aangevraagd', 'bevestigd') and not (b.geld is not distinct from 'open' and b.betaal_tot < now())
         and (b.start at time zone 'Europe/Amsterdam')::date = p_datum) < p.max_per_dag
    and not private.boek_bezet(p.gebruiker_id, m, m + make_interval(mins => p_minuten), p.buffer)
  order by m
$$;

create or replace function private.boekpagina_json(p private.boekpaginas)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('adres', p.adres, 'aan', p.aan, 'titel', p.titel, 'intro', p.intro, 'soorten', p.soorten,
    'uren', p.uren, 'buffer', p.buffer, 'min_vooraf', p.min_vooraf, 'vooruit', p.vooruit, 'max_per_dag', p.max_per_dag,
    'bevestigen', p.bevestigen, 'locatie', p.locatie, 'betalen', p.betalen, 'app_betalen', p.app_betalen,
    'annuleren', private.annuleer_regel(p.annuleren), 'kan_app_betalen', private.winkel_kan_betalen(p.gebruiker_id))
$$;

create or replace function private.boeking_json(b private.boekingen)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('id', b.id, 'soort', b.soort, 'start', b.start, 'minuten', b.minuten, 'naam', b.naam,
    'email', b.email, 'telefoon', b.telefoon, 'notitie', b.notitie, 'status', b.status, 'afspraak_id', b.afspraak_id,
    'verwerkt', b.verwerkt, 'prijs', b.prijs, 'reeks', b.reeks, 'via_chat', b.klant_id is not null,
    'betaald_gemeld', b.betaald_gemeld is not null, 'geld', b.geld)
$$;

-- Nu ook: vooraf betalen via de app en de annuleringsregel.
create or replace function public.boekpagina_instellen(p_naam text, p_wachtwoord text, p_instellingen jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); i jsonb := coalesce(p_instellingen, '{}'::jsonb);
  v_adres text := lower(trim(coalesce(i ->> 'adres', ''))); v_soorten jsonb; p private.boekpaginas;
  v_iban text := upper(regexp_replace(coalesce(i -> 'betalen' ->> 'iban', ''), '\s', '', 'g'));
  v_link text := trim(coalesce(i -> 'betalen' ->> 'link', ''));
  v_app boolean := coalesce((i ->> 'app_betalen')::boolean, false);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if v_adres !~ '^[a-z0-9-]{3,40}$' then
    return jsonb_build_object('fout', 'Kies een linknaam van 3 tot 40 tekens: letters, cijfers en streepjes.');
  end if;
  if exists (select 1 from private.boekpaginas where adres = v_adres and gebruiker_id <> v_id) then
    return jsonb_build_object('fout', 'Deze linknaam is al in gebruik. Kies een andere.');
  end if;
  if v_iban <> '' and v_iban !~ '^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$' then
    return jsonb_build_object('fout', 'Dit IBAN klopt niet.');
  end if;
  if v_link <> '' and v_link !~ '^https://[^\s<>"]+$' then
    return jsonb_build_object('fout', 'De betaallink moet met https:// beginnen.');
  end if;
  if v_app and not private.winkel_kan_betalen(v_id) then
    return jsonb_build_object('fout', 'Meld je eerst aan om betalingen te ontvangen bij Instellingen › Account › Betalen via de app.');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('naam', left(trim(s ->> 'naam'), 60),
                                               'minuten', least(480, greatest(10, (s ->> 'minuten')::int)),
                                               'prijs', case when coalesce(s ->> 'prijs', '') ~ '^\d{1,7}$'
                                                             then least(1000000, (s ->> 'prijs')::int) else 0 end)), '[]'::jsonb)
  into v_soorten
  from (select s from jsonb_array_elements(case when jsonb_typeof(i -> 'soorten') = 'array' then i -> 'soorten'
                                                else '[]'::jsonb end) s limit 6) x
  where trim(coalesce(s ->> 'naam', '')) <> '' and coalesce(s ->> 'minuten', '') ~ '^\d{1,3}$';
  if jsonb_array_length(v_soorten) = 0 then return jsonb_build_object('fout', 'Voeg minstens één soort afspraak toe.'); end if;
  insert into private.boekpaginas as b (gebruiker_id, adres, aan, titel, intro, soorten, uren, buffer, min_vooraf,
                                        vooruit, max_per_dag, bevestigen, locatie, betalen, app_betalen, annuleren)
  values (v_id, v_adres, coalesce((i ->> 'aan')::boolean, false), left(coalesce(i ->> 'titel', ''), 80),
          left(coalesce(i ->> 'intro', ''), 400), v_soorten,
          case when jsonb_typeof(i -> 'uren') = 'object' then i -> 'uren' else '{}'::jsonb end,
          least(120, greatest(0, coalesce((i ->> 'buffer')::int, 15))),
          least(336, greatest(0, coalesce((i ->> 'min_vooraf')::int, 12))),
          least(90, greatest(1, coalesce((i ->> 'vooruit')::int, 30))),
          least(20, greatest(1, coalesce((i ->> 'max_per_dag')::int, 4))),
          coalesce((i ->> 'bevestigen')::boolean, false), left(coalesce(i ->> 'locatie', ''), 200),
          jsonb_build_object('iban', v_iban, 'naam', left(trim(coalesce(i -> 'betalen' ->> 'naam', '')), 70),
                             'link', left(v_link, 300)),
          v_app, private.annuleer_regel(case when jsonb_typeof(i -> 'annuleren') = 'object' then i -> 'annuleren'
                                             else '{}'::jsonb end))
  on conflict (gebruiker_id) do update set adres = excluded.adres, aan = excluded.aan, titel = excluded.titel,
    intro = excluded.intro, soorten = excluded.soorten, uren = excluded.uren, buffer = excluded.buffer,
    min_vooraf = excluded.min_vooraf, vooruit = excluded.vooruit, max_per_dag = excluded.max_per_dag,
    bevestigen = excluded.bevestigen, locatie = excluded.locatie, betalen = excluded.betalen,
    app_betalen = excluded.app_betalen, annuleren = excluded.annuleren
  returning * into p;
  return jsonb_build_object('ok', true, 'pagina', private.boekpagina_json(p));
end; $$;

-- De klant ziet vooraf hoe betalen en annuleren gaat.
create or replace function public.chat_dienst_bekijken(p_naam text, p_wachtwoord text, p_adres text, p_soort integer)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare p private.boekpaginas;
begin
  if private.gebruiker_id(p_naam, p_wachtwoord) is null then return jsonb_build_object('geen_toegang', true); end if;
  perform private.boekingen_verlopen();
  select * into p from private.boekpaginas where adres = lower(coalesce(p_adres, ''));
  return public.boekpagina_bekijken(p_adres, p_soort)
    || jsonb_build_object('annuleren', private.annuleer_regel(coalesce(p.annuleren, '{}'::jsonb)),
                          'app_betalen', coalesce(p.app_betalen, false) and private.winkel_kan_betalen(p.gebruiker_id));
end; $$;

-- Boeken. Met betalen via de app wacht de boeking 30 minuten op de betaling; de betaling bevestigt hem.
create or replace function public.chat_boeken(p_naam text, p_wachtwoord text, p_adres text, p_soort integer,
                                              p_start timestamptz, p_herhaal text, p_aantal integer, p_notitie text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); p private.boekpaginas; v_soort jsonb;
  v_minuten int; v_prijs int; v_stap interval; v_aantal int; v_reeks text; v_moment timestamptz; v_dag date;
  v_email text; v_ids bigint[] := '{}'; v_starts timestamptz[] := '{}'; v_over timestamptz[] := '{}'; b private.boekingen;
  v_app boolean; v_status text;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select bp.* into p from private.boekpaginas bp join private.gebruikers u on u.id = bp.gebruiker_id
  where bp.adres = lower(coalesce(p_adres, '')) and bp.aan and not u.verwijderd and not u.geblokkeerd;
  if p.gebruiker_id is null then return jsonb_build_object('fout', 'Deze diensten zijn niet (meer) te boeken.'); end if;
  if p.gebruiker_id = v_id then return jsonb_build_object('fout', 'Je kunt niet bij jezelf boeken.'); end if;
  v_soort := p.soorten -> coalesce(p_soort, 0);
  if v_soort is null then return jsonb_build_object('fout', 'Kies wat je wilt boeken.'); end if;
  v_minuten := (v_soort ->> 'minuten')::int;
  v_prijs := coalesce((v_soort ->> 'prijs')::int, 0);
  v_app := p.app_betalen and v_prijs > 0 and private.winkel_kan_betalen(p.gebruiker_id);
  v_status := case when v_app or p.bevestigen then 'aangevraagd' else 'bevestigd' end;
  v_stap := case p_herhaal when 'week' then interval '7 days' when 'twee_weken' then interval '14 days' else null end;
  v_aantal := case when v_stap is null then 1 else least(12, greatest(1, coalesce(p_aantal, 1))) end;
  select coalesce(email, '') into v_email from private.gebruikers where id = v_id;
  perform pg_advisory_xact_lock(p.gebruiker_id);
  perform private.boekingen_verlopen();
  if (select count(*) from private.boekingen where gebruiker_id = p.gebruiker_id and aangemaakt > now() - interval '1 day') >= 40
     or (select count(*) from private.boekingen where gebruiker_id = p.gebruiker_id and klant_id = v_id
         and status in ('aangevraagd', 'bevestigd') and start > now()) + v_aantal > 26 then
    return jsonb_build_object('fout', 'Je kunt nu niet meer boeken. Probeer het later opnieuw.');
  end if;
  -- De eerste keer volgt alle regels van de boekingspagina; de volgende keren moeten ook vrij zijn.
  if not exists (select 1 from private.boek_momenten(p, (p_start at time zone 'Europe/Amsterdam')::date, v_minuten) m
                 where m = p_start) then
    return jsonb_build_object('fout', 'Dit moment is net niet meer vrij. Kies een ander moment.');
  end if;
  v_reeks := case when v_aantal > 1 then encode(extensions.gen_random_bytes(8), 'hex') end;
  for k in 0 .. v_aantal - 1 loop
    v_moment := ((p_start at time zone 'Europe/Amsterdam') + coalesce(v_stap, interval '0') * k) at time zone 'Europe/Amsterdam';
    v_dag := (v_moment at time zone 'Europe/Amsterdam')::date;
    if k > 0 and (private.boek_bezet(p.gebruiker_id, v_moment, v_moment + make_interval(mins => v_minuten), p.buffer)
       or (select count(*) from private.boekingen x where x.gebruiker_id = p.gebruiker_id
           and x.status in ('aangevraagd', 'bevestigd') and (x.start at time zone 'Europe/Amsterdam')::date = v_dag) >= p.max_per_dag)
    then
      v_over := v_over || v_moment;
      continue;
    end if;
    insert into private.boekingen (gebruiker_id, soort, start, minuten, naam, email, notitie, status, code_hash,
                                   klant_id, reeks, prijs, geld, betaal_tot)
    values (p.gebruiker_id, v_soort ->> 'naam', v_moment, v_minuten, private.weergave(v_id), v_email,
            left(trim(coalesce(p_notitie, '')), 500), v_status,
            encode(extensions.digest(encode(extensions.gen_random_bytes(12), 'hex'), 'sha256'), 'hex'),
            v_id, v_reeks, v_prijs, case when v_app then 'open' end,
            case when v_app then now() + interval '30 minutes' end)
    returning * into b;
    v_ids := v_ids || b.id;
    v_starts := v_starts || v_moment;
  end loop;
  -- Bij betalen via de app hoort de aanbieder het pas als er betaald is.
  if not v_app then
    perform private.push_inplannen(p.gebruiker_id, now(), 'reservering', 'boeking:' || v_ids[1],
      case when p.bevestigen then 'Nieuwe aanvraag: ' else 'Nieuwe boeking: ' end || (v_soort ->> 'naam'),
      private.weergave(v_id) || ', ' || to_char(p_start at time zone 'Europe/Amsterdam', 'DD-MM HH24:MI')
        || case when array_length(v_ids, 1) > 1 then ' (' || array_length(v_ids, 1) || 'x)' else '' end);
  end if;
  return jsonb_build_object('ok', true, 'ids', to_jsonb(v_ids), 'starts', to_jsonb(v_starts), 'overgeslagen', to_jsonb(v_over),
    'status', v_status, 'soort', v_soort ->> 'naam', 'minuten', v_minuten, 'prijs', v_prijs,
    'naam', private.weergave(p.gebruiker_id), 'locatie', p.locatie, 'app_betalen', v_app,
    'betalen', case when v_app then null else private.betaal_info(p) end);
end; $$;

-- De klant annuleert (alle nog komende keren uit de lijst) of meldt dat hij zelf betaald heeft.
-- Was er via de app betaald, dan rekent de annuleringsregel uit wat de klant terugkrijgt.
create or replace function public.chat_boeking_klant(p_naam text, p_wachtwoord text, p_ids bigint[], p_actie text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_aantal int; v_eerste private.boekingen;
  v_terug int; v_betaald int;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if p_actie = 'betaald' then
    update private.boekingen set betaald_gemeld = coalesce(betaald_gemeld, now())
    where id = any(coalesce(p_ids, '{}')) and klant_id = v_id and status in ('aangevraagd', 'bevestigd') and geld is null;
    get diagnostics v_aantal = row_count;
  elsif p_actie = 'annuleren' then
    select * into v_eerste from private.boekingen where id = any(coalesce(p_ids, '{}')) and klant_id = v_id
      and status in ('aangevraagd', 'bevestigd') and start > now() order by start limit 1;
    select coalesce(sum(private.terug_bij_annuleren(gebruiker_id, prijs, start, true)), 0), coalesce(sum(prijs), 0)
    into v_terug, v_betaald
    from private.boekingen where id = any(coalesce(p_ids, '{}')) and klant_id = v_id
      and status in ('aangevraagd', 'bevestigd') and start > now() and geld = 'betaald';
    update private.boekingen set status = 'geannuleerd', verwerkt = afspraak_id is null,
      geld_terug = case when geld = 'betaald' then private.terug_bij_annuleren(gebruiker_id, prijs, start, true) else 0 end,
      geld_aan = case when geld = 'betaald' then prijs - private.terug_bij_annuleren(gebruiker_id, prijs, start, true) else 0 end,
      geld = case geld when 'betaald' then 'verrekenen' when 'open' then null else geld end
    where id = any(coalesce(p_ids, '{}')) and klant_id = v_id and status in ('aangevraagd', 'bevestigd') and start > now();
    get diagnostics v_aantal = row_count;
    if v_aantal > 0 and v_eerste.geld is distinct from 'open' then
      perform private.push_inplannen(v_eerste.gebruiker_id, now(), 'reservering', 'boeking-weg:' || v_eerste.id,
        'Geannuleerd: ' || v_eerste.soort, v_eerste.naam || ', '
          || to_char(v_eerste.start at time zone 'Europe/Amsterdam', 'DD-MM HH24:MI')
          || case when v_aantal > 1 then ' (' || v_aantal || 'x)' else '' end);
    end if;
  else
    return jsonb_build_object('fout', 'Dit kan niet.');
  end if;
  if v_aantal = 0 then return jsonb_build_object('fout', 'Dit kan niet (meer).'); end if;
  return jsonb_build_object('ok', true, 'aantal', v_aantal, 'terug', coalesce(v_terug, 0), 'betaald', coalesce(v_betaald, 0));
end; $$;

-- De aanbieder: bevestigen, afwijzen of annuleren vanuit de chat. Was er via de app betaald, dan krijgt de klant
-- alles terug.
create or replace function public.chat_boeking_afhandelen(p_naam text, p_wachtwoord text, p_ids bigint[], p_actie text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_aantal int;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if p_actie not in ('bevestigen', 'afwijzen', 'annuleren') then return jsonb_build_object('fout', 'Dit kan niet.'); end if;
  update private.boekingen set
    status = case p_actie when 'bevestigen' then 'bevestigd' when 'afwijzen' then 'afgewezen' else 'geannuleerd' end,
    verwerkt = false,
    betaal_tot = case when p_actie = 'bevestigen' then null else betaal_tot end,
    geld_terug = case when p_actie <> 'bevestigen' and geld = 'betaald' then prijs else geld_terug end,
    geld_aan = case when p_actie <> 'bevestigen' and geld = 'betaald' then 0 else geld_aan end,
    geld = case when p_actie = 'bevestigen' then geld when geld = 'betaald' then 'verrekenen'
                when geld = 'open' then null else geld end
  where id = any(coalesce(p_ids, '{}')) and gebruiker_id = v_id
    and case p_actie when 'annuleren' then status in ('aangevraagd', 'bevestigd') and start > now()
                     else status = 'aangevraagd' end;
  get diagnostics v_aantal = row_count;
  if v_aantal = 0 then return jsonb_build_object('fout', 'Dit kan niet (meer).'); end if;
  return jsonb_build_object('ok', true, 'aantal', v_aantal);
end; $$;

create or replace function public.boeking_afhandelen(p_naam text, p_wachtwoord text, p_id bigint, p_actie text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); b private.boekingen;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  update private.boekingen set
    status = case p_actie when 'bevestigen' then 'bevestigd' when 'afwijzen' then 'afgewezen' else 'geannuleerd' end,
    verwerkt = false,
    betaal_tot = case when p_actie = 'bevestigen' then null else betaal_tot end,
    geld_terug = case when p_actie <> 'bevestigen' and geld = 'betaald' then prijs else geld_terug end,
    geld_aan = case when p_actie <> 'bevestigen' and geld = 'betaald' then 0 else geld_aan end,
    geld = case when p_actie = 'bevestigen' then geld when geld = 'betaald' then 'verrekenen'
                when geld = 'open' then null else geld end
  where id = p_id and gebruiker_id = v_id and p_actie in ('bevestigen', 'afwijzen', 'annuleren')
    and case p_actie when 'bevestigen' then status = 'aangevraagd' when 'afwijzen' then status = 'aangevraagd'
                     else status in ('aangevraagd', 'bevestigd') end
  returning * into b;
  if b.id is null then return jsonb_build_object('fout', 'Dit kan niet (meer).'); end if;
  return jsonb_build_object('ok', true, 'boeking', private.boeking_json(b));
end; $$;

create or replace function public.boeking_annuleren(p_code text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare b private.boekingen;
begin
  update private.boekingen set status = 'geannuleerd', verwerkt = afspraak_id is null,
    geld_terug = case when geld = 'betaald' then private.terug_bij_annuleren(gebruiker_id, prijs, start, true) else 0 end,
    geld_aan = case when geld = 'betaald' then prijs - private.terug_bij_annuleren(gebruiker_id, prijs, start, true) else 0 end,
    geld = case geld when 'betaald' then 'verrekenen' when 'open' then null else geld end
  where code_hash = encode(extensions.digest(coalesce(p_code, ''), 'sha256'), 'hex')
    and status in ('aangevraagd', 'bevestigd') and start > now()
  returning * into b;
  if b.id is null then return jsonb_build_object('fout', 'Deze afspraak kan niet (meer) worden geannuleerd.'); end if;
  perform private.push_inplannen(b.gebruiker_id, now(), 'reservering', 'boeking-weg:' || b.id,
    'Geannuleerd: ' || b.soort, b.naam || ', ' || to_char(b.start at time zone 'Europe/Amsterdam', 'DD-MM HH24:MI'));
  return jsonb_build_object('ok', true);
end; $$;

-- De stand in de chat, nu met betalen via de app en de annuleringsregel.
create or replace function public.chat_boeking_status(p_naam text, p_wachtwoord text, p_ids bigint[])
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  perform private.boekingen_verlopen();
  return jsonb_build_object('boekingen', coalesce((
    select jsonb_agg(jsonb_build_object('id', b.id, 'status', b.status, 'start', b.start, 'afgevinkt', b.afgevinkt,
      'betaald', b.betaald_gemeld is not null, 'aanbieder', b.gebruiker_id = v_id,
      'betalen', case when b.klant_id = v_id and b.geld is null then private.betaal_info(p) end,
      'geld', b.geld, 'betaal_tot', b.betaal_tot, 'prijs', b.prijs, 'terug', b.geld_terug, 'aan', b.geld_aan,
      'annuleren', private.annuleer_regel(coalesce(p.annuleren, '{}'::jsonb)),
      'saldo', private.klant_saldo(b.gebruiker_id, private.klant_sleutel(b.klant_id, b.naam)),
      'ontvangen', exists (select 1 from private.zaak_posten z where not z.weg and z.soort = 'betaling'
        and z.boeking_id in (select r.id from private.boekingen r where r.id = b.id or (b.reeks is not null and r.reeks = b.reeks)))))
    from private.boekingen b left join private.boekpaginas p on p.gebruiker_id = b.gebruiker_id
    where b.id = any(coalesce(p_ids, '{}')) and (b.klant_id = v_id or b.gebruiker_id = v_id)), '[]'::jsonb));
end; $$;

-- Wie zelf geld regelt, meldt "geld ontvangen". Bij betalen via de app doet de app dat zelf.
create or replace function public.zaak_betaling_ontvangen(p_naam text, p_wachtwoord text, p_ids bigint[], p_bedrag integer)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); b private.boekingen; v_bedrag int;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into b from private.boekingen where id = any(coalesce(p_ids, '{}')) and gebruiker_id = v_id order by start limit 1;
  if b.id is null then return jsonb_build_object('fout', 'Dit kan niet.'); end if;
  if b.geld is not null then return jsonb_build_object('fout', 'Deze boeking is via de app betaald. De app verwerkt het geld zelf.'); end if;
  v_bedrag := coalesce(p_bedrag, (select sum(prijs) from private.boekingen where id = any(p_ids) and gebruiker_id = v_id
                                  and status <> 'afgewezen'))::int;
  if v_bedrag is null or v_bedrag <= 0 or v_bedrag > 100000000 then return jsonb_build_object('fout', 'Vul een bedrag in.'); end if;
  update private.boekingen set betaald_gemeld = coalesce(betaald_gemeld, now()) where id = any(p_ids) and gebruiker_id = v_id;
  insert into private.zaak_posten (gebruiker_id, klant_id, klant, soort, bedrag, omschrijving, boeking_id)
  values (v_id, b.klant_id, b.naam, 'betaling', v_bedrag, b.soort, b.id);
  return jsonb_build_object('ok', true, 'saldo', private.klant_saldo(v_id, private.klant_sleutel(b.klant_id, b.naam)));
end; $$;

-- --- Voor de betaalfunctie (alleen de service-rol) ---------------------------------------------------------------

-- Wat de klant nu kan betalen, met de gegevens voor Stripe.
create or replace function public.stripe_boekingen(p_ids bigint[], p_klant bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_aanbieder bigint; v_totaal int; v_ids bigint[]; v_soort text; v_aantal int;
begin
  perform private.boekingen_verlopen();
  select array_agg(id order by start), sum(prijs), min(gebruiker_id), min(soort), count(distinct gebruiker_id)
  into v_ids, v_totaal, v_aanbieder, v_soort, v_aantal
  from private.boekingen where id = any(coalesce(p_ids, '{}')) and klant_id = p_klant and geld = 'open'
    and status in ('aangevraagd', 'bevestigd') and start > now();
  if v_ids is null or v_aantal <> 1 or v_totaal <= 0 then return null; end if;
  return jsonb_build_object('ids', to_jsonb(v_ids), 'totaal', v_totaal, 'aanbieder', v_aanbieder,
    'titel', v_soort || ' bij ' || private.weergave(v_aanbieder)
      || case when array_length(v_ids, 1) > 1 then ' (' || array_length(v_ids, 1) || 'x)' else '' end,
    'kan_ontvangen', private.winkel_kan_betalen(v_aanbieder));
end; $$;

-- De betaalpagina is gemaakt: zo lang (plus een marge) blijft het moment gereserveerd.
create or replace function public.stripe_boeking_sessie(p_ids bigint[], p_klant bigint, p_sessie text, p_tot timestamptz)
returns boolean language sql security definer set search_path to '' as $$
  with x as (
    update private.boekingen set betaal_sessie = p_sessie, betaal_tot = greatest(betaal_tot, p_tot + interval '5 minutes')
    where id = any(coalesce(p_ids, '{}')) and klant_id = p_klant and geld = 'open' returning 1)
  select count(*) > 0 from x
$$;

-- Stripe meldt dat er betaald is. Wat intussen vervallen was, gaat in zijn geheel terug.
create or replace function public.stripe_boeking_betaald(p_sessie text, p_betaling text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_aanbieder bigint; v_klant bigint; v_ids bigint[]; v_totaal int; v_soort text; v_start timestamptz; v_terug int;
begin
  update private.boekingen set geld = 'betaald', betaal_intent = p_betaling, betaal_tot = null, status = 'bevestigd',
    betaald_gemeld = coalesce(betaald_gemeld, now()), verwerkt = false
  where betaal_sessie = p_sessie and geld = 'open' and status in ('aangevraagd', 'bevestigd');
  update private.boekingen set geld = 'verrekenen', betaal_intent = p_betaling, geld_terug = prijs, geld_aan = 0
  where betaal_sessie = p_sessie and (geld is null or geld = 'open') and status not in ('aangevraagd', 'bevestigd');
  get diagnostics v_terug = row_count;
  select array_agg(id order by start), sum(prijs), min(gebruiker_id), min(klant_id), min(soort), min(start)
  into v_ids, v_totaal, v_aanbieder, v_klant, v_soort, v_start
  from private.boekingen where betaal_sessie = p_sessie and geld = 'betaald';
  if v_ids is not null then
    perform private.push_inplannen(v_aanbieder, now(), 'reservering', 'boeking:' || v_ids[1],
      'Nieuwe boeking, betaald: ' || v_soort,
      private.weergave(v_klant) || ', ' || to_char(v_start at time zone 'Europe/Amsterdam', 'DD-MM HH24:MI')
        || case when array_length(v_ids, 1) > 1 then ' (' || array_length(v_ids, 1) || 'x)' else '' end);
  end if;
  return jsonb_build_object('betaald', coalesce(array_length(v_ids, 1), 0), 'terug', v_terug);
end; $$;

-- Wat nu verrekend kan worden: geannuleerde betaalde boekingen, en afspraken die voorbij zijn (afgevinkt, of een dag
-- na afloop). p_gebruiker = null: alles (voor de webhook); anders alleen boekingen van of bij die persoon.
create or replace function public.stripe_te_verrekenen(p_gebruiker bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  update private.boekingen set geld = 'verrekenen', geld_aan = prijs, geld_terug = 0
  where geld = 'betaald' and status = 'bevestigd'
    and (afgevinkt is not null or start + make_interval(mins => minuten) + interval '1 day' < now())
    and (p_gebruiker is null or gebruiker_id = p_gebruiker or klant_id = p_gebruiker);
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', b.id, 'betaling', b.betaal_intent,
      'terug', case when b.teruggestort is null then b.geld_terug else 0 end,
      'aan', b.geld_aan, 'commissie', case when b.geld_aan > 0
        then round(private.commissie(b.geld_aan / 100.0) * 100)::int else 0 end,
      'account', u.stripe_account, 'klaar', u.stripe_klaar) order by b.id)
    from (select * from private.boekingen where geld = 'verrekenen' and betaal_intent is not null
            and (p_gebruiker is null or gebruiker_id = p_gebruiker or klant_id = p_gebruiker)
          order by id limit 50) b
    join private.gebruikers u on u.id = b.gebruiker_id), '[]'::jsonb);
end; $$;

-- Het terugstorten is gelukt (apart bijgehouden, zodat een volgende poging niet nog eens terugstort).
create or replace function public.stripe_boeking_teruggestort(p_id bigint)
returns boolean language sql security definer set search_path to '' as $$
  with x as (update private.boekingen set teruggestort = coalesce(teruggestort, now())
             where id = p_id and geld = 'verrekenen' returning 1)
  select count(*) > 0 from x
$$;

-- Terugbetaald en/of uitbetaald: afronden en in de boekhouding van de aanbieder zetten.
create or replace function public.stripe_boeking_verrekend(p_id bigint)
returns boolean language plpgsql security definer set search_path to '' as $$
declare b private.boekingen; v_commissie int;
begin
  update private.boekingen set geld = 'verrekend', verrekend_op = now()
  where id = p_id and geld = 'verrekenen' returning * into b;
  if b.id is null then return false; end if;
  if b.geld_aan > 0 then
    v_commissie := round(private.commissie(b.geld_aan / 100.0) * 100)::int;
    if not exists (select 1 from private.zaak_posten where boeking_id = b.id and soort = 'dienst' and not weg) then
      insert into private.zaak_posten (gebruiker_id, klant_id, klant, soort, bedrag, omschrijving, datum, boeking_id)
      values (b.gebruiker_id, b.klant_id, b.naam, 'dienst', b.geld_aan,
              b.soort || case when b.status = 'geannuleerd' then ' (laat geannuleerd)' else '' end,
              (b.start at time zone 'Europe/Amsterdam')::date, b.id);
    end if;
    insert into private.zaak_posten (gebruiker_id, klant_id, klant, soort, bedrag, omschrijving, boeking_id)
    values (b.gebruiker_id, b.klant_id, b.naam, 'betaling', b.geld_aan, b.soort || ' (via de app)', b.id);
    if v_commissie > 0 then
      insert into private.zaak_posten (gebruiker_id, soort, bedrag, btw, omschrijving, categorie, boeking_id)
      values (b.gebruiker_id, 'kosten', v_commissie, 0, 'Commissie betalen via de app', 'Betaalkosten', b.id);
    end if;
  end if;
  return true;
end; $$;

revoke all on function private.annuleer_regel(jsonb), private.terug_bij_annuleren(bigint, integer, timestamptz, boolean),
  private.boekingen_verlopen() from public, anon, authenticated;
revoke execute on function public.stripe_boekingen(bigint[], bigint),
  public.stripe_boeking_sessie(bigint[], bigint, text, timestamptz), public.stripe_boeking_betaald(text, text),
  public.stripe_te_verrekenen(bigint), public.stripe_boeking_verrekend(bigint), public.stripe_boeking_teruggestort(bigint)
  from public, anon, authenticated;
grant execute on function public.stripe_boekingen(bigint[], bigint),
  public.stripe_boeking_sessie(bigint[], bigint, text, timestamptz), public.stripe_boeking_betaald(text, text),
  public.stripe_te_verrekenen(bigint), public.stripe_boeking_verrekend(bigint), public.stripe_boeking_teruggestort(bigint)
  to service_role;
