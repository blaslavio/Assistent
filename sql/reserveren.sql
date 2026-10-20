-- Reserveren bij zaken in de app (restaurant, kapper, ...). Gratis voor zaak en gast.
-- Een zaak is een winkel (private.winkels); de gast krijgt de reservering in zijn agenda.

create table if not exists private.reserveren (
  gebruiker_id bigint primary key references private.winkels(gebruiker_id),
  aan boolean not null default false,
  soort text not null default 'tafel' check (soort in ('tafel', 'afspraak')),
  -- Per weekdag (1 = maandag) lijsten van [eerste, laatste] aanvangstijd, bijvoorbeeld {"5": [["17:00", "21:00"]]}.
  uren jsonb not null default '{}'::jsonb,
  stap integer not null default 30 check (stap between 10 and 240),
  duur integer not null default 120 check (duur between 10 and 600),
  capaciteit integer not null default 20 check (capaciteit between 1 and 1000),
  max_groep integer not null default 8 check (max_groep between 1 and 100),
  vooruit integer not null default 60 check (vooruit between 1 and 365),
  min_vooraf integer not null default 60 check (min_vooraf between 0 and 10080),
  annuleren_uren integer not null default 24 check (annuleren_uren between 0 and 336),
  gesloten jsonb not null default '[]'::jsonb,
  bericht text not null default '',
  bijgewerkt timestamptz not null default now()
);

create table if not exists private.reserveringen (
  id bigint generated always as identity primary key,
  zaak bigint not null references private.winkels(gebruiker_id),
  gast bigint not null references private.gebruikers(id),
  start timestamptz not null,
  minuten integer not null check (minuten between 10 and 600),
  personen integer not null check (personen between 1 and 100),
  opmerking text not null default '',
  gelegenheid text not null default '',
  status text not null default 'bevestigd'
    check (status in ('bevestigd', 'wachtlijst', 'geannuleerd', 'gekomen', 'niet_gekomen')),
  door_zaak boolean not null default false,
  te_laat_geannuleerd boolean not null default false,
  aangemaakt timestamptz not null default now(),
  gewijzigd timestamptz not null default now()
);
-- Een review na een reservering loopt via een bezoek, zodat reviews, antwoorden en melden hetzelfde werken.
alter table private.reserveringen add column if not exists bezoek_id bigint references private.bezoekcodes(id);
create index if not exists reserveringen_zaak_start on private.reserveringen (zaak, start);
create index if not exists reserveringen_gast on private.reserveringen (gast, start);

alter table private.reserveren enable row level security;
alter table private.reserveringen enable row level security;

-- Hoeveel gasten er op dat moment al zijn (overlappende reserveringen), zonder verwijderde accounts.
create or replace function private.reserveren_bezet(p_zaak bigint, p_start timestamptz, p_minuten integer)
returns integer language sql stable security definer set search_path to '' as $$
  select coalesce(sum(r.personen), 0)::integer
  from private.reserveringen r join private.gebruikers g on g.id = r.gast
  where r.zaak = p_zaak and r.status in ('bevestigd', 'gekomen') and not g.verwijderd
    and r.start < p_start + make_interval(mins => p_minuten)
    and p_start < r.start + make_interval(mins => r.minuten)
$$;

-- Alle aanvangstijden van een dag volgens de openingstijden (Nederlandse tijd).
create or replace function private.reserveren_momenten(p_zaak bigint, p_datum date)
returns setof timestamptz language sql stable security definer set search_path to '' as $$
  select distinct (t at time zone 'Europe/Amsterdam')
  from private.reserveren z,
       jsonb_array_elements(coalesce(z.uren -> extract(isodow from p_datum)::text, '[]'::jsonb)) b,
       generate_series(p_datum + (b ->> 0)::time, p_datum + (b ->> 1)::time, make_interval(mins => z.stap)) t
  where z.gebruiker_id = p_zaak and not (z.gesloten ? p_datum::text)
    and jsonb_typeof(b) = 'array' and jsonb_array_length(b) = 2
    and (b ->> 0) ~ '^\d{1,2}:\d{2}$' and (b ->> 1) ~ '^\d{1,2}:\d{2}$'
  order by 1
$$;

create or replace function private.reserveren_json(z private.reserveren)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('aan', z.aan, 'soort', z.soort, 'uren', z.uren, 'stap', z.stap, 'duur', z.duur,
    'capaciteit', z.capaciteit, 'max_groep', z.max_groep, 'vooruit', z.vooruit, 'min_vooraf', z.min_vooraf,
    'annuleren_uren', z.annuleren_uren, 'gesloten', z.gesloten, 'bericht', z.bericht)
$$;

-- De zaak zet reserveren aan of uit en stelt het in.
create or replace function public.reserveren_instellen(p_naam text, p_wachtwoord text, p_instellingen jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); i jsonb := coalesce(p_instellingen, '{}'::jsonb);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if not exists (select 1 from private.winkels where gebruiker_id = v_id) then
    return jsonb_build_object('fout', 'Maak eerst je winkel aan bij Mijn webshop.');
  end if;
  if jsonb_typeof(coalesce(i -> 'uren', '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(i -> 'gesloten', '[]'::jsonb)) <> 'array' then
    return jsonb_build_object('fout', 'Ongeldige openingstijden.');
  end if;
  insert into private.reserveren (gebruiker_id, aan, soort, uren, stap, duur, capaciteit, max_groep, vooruit,
                                  min_vooraf, annuleren_uren, gesloten, bericht, bijgewerkt)
  values (v_id, coalesce((i ->> 'aan')::boolean, false),
          case when i ->> 'soort' = 'afspraak' then 'afspraak' else 'tafel' end,
          coalesce(i -> 'uren', '{}'::jsonb),
          least(240, greatest(10, coalesce((i ->> 'stap')::int, 30))),
          least(600, greatest(10, coalesce((i ->> 'duur')::int, 120))),
          least(1000, greatest(1, coalesce((i ->> 'capaciteit')::int, 20))),
          least(100, greatest(1, coalesce((i ->> 'max_groep')::int, 8))),
          least(365, greatest(1, coalesce((i ->> 'vooruit')::int, 60))),
          least(10080, greatest(0, coalesce((i ->> 'min_vooraf')::int, 60))),
          least(336, greatest(0, coalesce((i ->> 'annuleren_uren')::int, 24))),
          coalesce(i -> 'gesloten', '[]'::jsonb), left(coalesce(i ->> 'bericht', ''), 500), now())
  on conflict (gebruiker_id) do update set aan = excluded.aan, soort = excluded.soort, uren = excluded.uren,
    stap = excluded.stap, duur = excluded.duur, capaciteit = excluded.capaciteit, max_groep = excluded.max_groep,
    vooruit = excluded.vooruit, min_vooraf = excluded.min_vooraf, annuleren_uren = excluded.annuleren_uren,
    gesloten = excluded.gesloten, bericht = excluded.bericht, bijgewerkt = now();
  return jsonb_build_object('ok', true);
end; $$;

-- Voor de zaak: instellingen en de reserveringen in een periode.
create or replace function public.reserveren_mijn_zaak(p_naam text, p_wachtwoord text, p_van date, p_tot date)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); z private.reserveren;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into z from private.reserveren where gebruiker_id = v_id;
  return jsonb_build_object(
    'winkel', exists (select 1 from private.winkels where gebruiker_id = v_id),
    'instellingen', case when z.gebruiker_id is null then null else private.reserveren_json(z) end,
    'reserveringen', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'start', r.start, 'minuten', r.minuten, 'personen', r.personen,
        'gast', private.weergave(r.gast), 'opmerking', r.opmerking, 'gelegenheid', r.gelegenheid, 'status', r.status,
        'te_laat', r.te_laat_geannuleerd, 'door_zaak', r.door_zaak,
        'niet_gekomen', (select count(*) from private.reserveringen x
                         where x.zaak = v_id and x.gast = r.gast and x.status = 'niet_gekomen'))
        order by r.start, r.id)
      from private.reserveringen r join private.gebruikers g on g.id = r.gast
      where r.zaak = v_id and not g.verwijderd
        and r.start >= (p_van::timestamp at time zone 'Europe/Amsterdam')
        and r.start < ((p_tot + 1)::timestamp at time zone 'Europe/Amsterdam')), '[]'::jsonb));
end; $$;

-- Zaken waar je kunt reserveren.
create or replace function public.reserveren_zaken(p_naam text, p_wachtwoord text, p_zoek text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_zoek text := '%' || coalesce(trim(p_zoek), '') || '%';
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object('zaken', coalesce((
    select jsonb_agg(jsonb_build_object('adres', w.adres, 'naam', w.naam, 'omschrijving', left(w.omschrijving, 300),
      'kleur', w.kleur, 'winkeladres', w.winkeladres, 'lat', w.lat, 'lon', w.lon, 'soort', z.soort,
      'max_groep', z.max_groep, 'duur', z.duur, 'bericht', z.bericht, 'van_mij', w.gebruiker_id = v_id)
      order by w.naam)
    from private.winkels w join private.reserveren z on z.gebruiker_id = w.gebruiker_id
    join private.gebruikers g on g.id = w.gebruiker_id
    where z.aan and not g.verwijderd and (w.naam ilike v_zoek or w.omschrijving ilike v_zoek or w.winkeladres ilike v_zoek)
    limit 100), '[]'::jsonb));
end; $$;

-- Vrije en volle tijden op een dag voor een aantal personen.
create or replace function public.reserveren_tijden(p_naam text, p_wachtwoord text, p_adres text, p_datum date,
                                                    p_personen integer)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); z private.reserveren; v_personen int;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select r.* into z from private.reserveren r join private.winkels w on w.gebruiker_id = r.gebruiker_id
  where w.adres = p_adres and r.aan;
  if z.gebruiker_id is null then return jsonb_build_object('fout', 'Deze zaak neemt geen reserveringen aan.'); end if;
  v_personen := case when z.soort = 'afspraak' then 1 else greatest(1, coalesce(p_personen, 2)) end;
  if v_personen > z.max_groep then
    return jsonb_build_object('fout', 'Voor meer dan ' || z.max_groep || ' personen: stuur de zaak een bericht.');
  end if;
  return jsonb_build_object('duur', z.duur, 'soort', z.soort, 'tijden', coalesce((
    select jsonb_agg(jsonb_build_object('start', m,
      'vrij', private.reserveren_bezet(z.gebruiker_id, m, z.duur) + v_personen <= z.capaciteit) order by m)
    from private.reserveren_momenten(z.gebruiker_id, p_datum) m
    where m >= now() + make_interval(mins => z.min_vooraf) and m <= now() + make_interval(days => z.vooruit)),
    '[]'::jsonb));
end; $$;

create or replace function public.reserveren(p_naam text, p_wachtwoord text, p_adres text, p_start timestamptz,
                                             p_personen integer, p_opmerking text, p_gelegenheid text,
                                             p_wachtlijst boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); z private.reserveren; w private.winkels;
  v_personen int; v_status text; v_nieuw bigint;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into w from private.winkels where adres = p_adres;
  select * into z from private.reserveren where gebruiker_id = w.gebruiker_id and aan;
  if z.gebruiker_id is null then return jsonb_build_object('fout', 'Deze zaak neemt geen reserveringen aan.'); end if;
  if z.gebruiker_id = v_id then return jsonb_build_object('fout', 'Je kunt niet bij je eigen zaak reserveren.'); end if;
  v_personen := case when z.soort = 'afspraak' then 1 else greatest(1, coalesce(p_personen, 2)) end;
  if v_personen > z.max_groep then
    return jsonb_build_object('fout', 'Voor meer dan ' || z.max_groep || ' personen: stuur de zaak een bericht.');
  end if;
  if p_start < now() + make_interval(mins => z.min_vooraf) or p_start > now() + make_interval(days => z.vooruit)
     or not exists (select 1 from private.reserveren_momenten(z.gebruiker_id,
                                                              (p_start at time zone 'Europe/Amsterdam')::date) m
                    where m = p_start) then
    return jsonb_build_object('fout', 'Op deze tijd kun je niet reserveren.');
  end if;
  if (select count(*) from private.reserveringen where gast = v_id and aangemaakt > now() - interval '1 day') >= 20
     or (select count(*) from private.reserveringen where gast = v_id and zaak = z.gebruiker_id
         and status in ('bevestigd', 'wachtlijst') and start > now()) >= 3 then
    return jsonb_build_object('fout', 'Je hebt al veel reserveringen. Annuleer er eerst een.');
  end if;
  if exists (select 1 from private.reserveringen where gast = v_id and zaak = z.gebruiker_id and start = p_start
             and status in ('bevestigd', 'wachtlijst')) then
    return jsonb_build_object('fout', 'Je hebt op deze tijd al gereserveerd.');
  end if;
  perform pg_advisory_xact_lock(z.gebruiker_id);
  if private.reserveren_bezet(z.gebruiker_id, p_start, z.duur) + v_personen <= z.capaciteit then
    v_status := 'bevestigd';
  elsif coalesce(p_wachtlijst, false) then
    v_status := 'wachtlijst';
  else
    return jsonb_build_object('vol', true, 'fout', 'Deze tijd is net vol. Kies een andere tijd of zet je op de wachtlijst.');
  end if;
  insert into private.reserveringen (zaak, gast, start, minuten, personen, opmerking, gelegenheid, status)
  values (z.gebruiker_id, v_id, p_start, z.duur, v_personen, left(coalesce(p_opmerking, ''), 500),
          left(coalesce(p_gelegenheid, ''), 40), v_status)
  returning id into v_nieuw;
  return jsonb_build_object('ok', true, 'id', v_nieuw, 'status', v_status, 'start', p_start, 'minuten', z.duur,
    'personen', v_personen, 'zaak', w.naam, 'adres', w.adres, 'winkeladres', w.winkeladres, 'bericht', z.bericht,
    'annuleren_uren', z.annuleren_uren);
end; $$;

-- Gast annuleert (ook wachtlijst), of de zaak annuleert. Te laat annuleren mag, de zaak ziet het wel.
create or replace function public.reservering_annuleren(p_naam text, p_wachtwoord text, p_id bigint)
returns boolean language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return false; end if;
  update private.reserveringen r set status = 'geannuleerd', gewijzigd = now(),
    te_laat_geannuleerd = r.status = 'bevestigd' and r.start < now() + make_interval(hours => z.annuleren_uren)
  from private.reserveren z
  where r.id = p_id and r.gast = v_id and z.gebruiker_id = r.zaak and r.status in ('bevestigd', 'wachtlijst');
  if found then return true; end if;
  update private.reserveringen set status = 'geannuleerd', door_zaak = true, gewijzigd = now()
  where id = p_id and zaak = v_id and status in ('bevestigd', 'wachtlijst');
  return found;
end; $$;

-- De zaak noteert of de gast gekomen is.
create or replace function public.reservering_status(p_naam text, p_wachtwoord text, p_id bigint, p_status text)
returns boolean language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null or p_status not in ('bevestigd', 'gekomen', 'niet_gekomen') then return false; end if;
  update private.reserveringen set status = p_status, gewijzigd = now()
  where id = p_id and zaak = v_id and status in ('bevestigd', 'gekomen', 'niet_gekomen')
    and start < now() + interval '1 day';
  return found;
end; $$;

-- Van de wachtlijst naar een vaste plek, als er inmiddels plaats is.
create or replace function public.wachtlijst_bevestigen(p_naam text, p_wachtwoord text, p_id bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); r private.reserveringen; z private.reserveren;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into r from private.reserveringen where id = p_id and gast = v_id and status = 'wachtlijst' and start > now();
  if r.id is null then return jsonb_build_object('fout', 'Deze wachtlijstplek bestaat niet meer.'); end if;
  select * into z from private.reserveren where gebruiker_id = r.zaak and aan;
  if z.gebruiker_id is null then return jsonb_build_object('fout', 'Deze zaak neemt geen reserveringen aan.'); end if;
  perform pg_advisory_xact_lock(r.zaak);
  if private.reserveren_bezet(r.zaak, r.start, r.minuten) + r.personen > z.capaciteit then
    return jsonb_build_object('fout', 'Er is nog geen plek vrij.');
  end if;
  update private.reserveringen set status = 'bevestigd', gewijzigd = now() where id = p_id;
  return jsonb_build_object('ok', true);
end; $$;

-- Mijn reserveringen als gast; bij een wachtlijst zie je of er plek is gekomen.
create or replace function public.mijn_reserveringen(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object('reserveringen', coalesce((
    select jsonb_agg(jsonb_build_object('id', r.id, 'start', r.start, 'minuten', r.minuten, 'personen', r.personen,
      'opmerking', r.opmerking, 'gelegenheid', r.gelegenheid, 'status', r.status, 'door_zaak', r.door_zaak,
      'zaak', w.naam, 'adres', w.adres, 'winkeladres', w.winkeladres, 'bericht', z.bericht,
      'annuleren_tot', r.start - make_interval(hours => z.annuleren_uren),
      'plek_vrij', r.status = 'wachtlijst' and z.aan
                   and private.reserveren_bezet(r.zaak, r.start, r.minuten) + r.personen <= z.capaciteit,
      'review', r.status in ('bevestigd', 'gekomen') and r.start < now()
                and not exists (select 1 from private.bezoek_beoordelingen b where b.bezoek_id = r.bezoek_id))
      order by r.start)
    from private.reserveringen r join private.winkels w on w.gebruiker_id = r.zaak
    join private.reserveren z on z.gebruiker_id = r.zaak
    where r.gast = v_id and r.start > now() - interval '60 days'), '[]'::jsonb));
end; $$;

-- Review na een reservering: alleen als de gast er echt was (niet als 'niet gekomen'), tot 60 dagen erna.
create or replace function public.reservering_beoordelen(p_naam text, p_wachtwoord text, p_id bigint,
                                                         p_sterren integer, p_tekst text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); r private.reserveringen; v_bezoek bigint;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into r from private.reserveringen where id = p_id and gast = v_id for update;
  if r.id is null or r.status not in ('bevestigd', 'gekomen') or r.start > now() then
    return jsonb_build_object('fout', 'Je kunt een review schrijven na je bezoek.');
  end if;
  if r.start < now() - interval '60 days' then return jsonb_build_object('fout', 'Een review kan tot 60 dagen na je bezoek.'); end if;
  if p_sterren not between 1 and 5 then return jsonb_build_object('fout', 'Kies 1 tot 5 sterren.'); end if;
  v_bezoek := r.bezoek_id;
  if v_bezoek is null then
    insert into private.bezoekcodes (verkoper, code, geldig_tot, bezoeker, bevestigd)
    values (r.zaak, 'RES' || r.id, r.start, v_id, r.start) returning id into v_bezoek;
    update private.reserveringen set bezoek_id = v_bezoek where id = r.id;
  end if;
  insert into private.bezoek_beoordelingen (bezoek_id, door, over, sterren, tekst)
  values (v_bezoek, v_id, r.zaak, p_sterren, left(trim(coalesce(p_tekst, '')), 500))
  on conflict (bezoek_id) do nothing;
  if not found then return jsonb_build_object('fout', 'Je hebt dit bezoek al beoordeeld.'); end if;
  return jsonb_build_object('ok', true);
end; $$;

revoke all on function private.reserveren_bezet(bigint, timestamptz, integer) from public, anon, authenticated;
revoke all on function private.reserveren_momenten(bigint, date) from public, anon, authenticated;
revoke all on function private.reserveren_json(private.reserveren) from public, anon, authenticated;
