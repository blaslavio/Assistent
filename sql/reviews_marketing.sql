-- Reviews en marketing voor winkels in de app.
--
-- Reviews: alleen na een echte aankoop (afgeronde bestelling, bestond al) of een echt bezoek. Een bezoek bewijs je
-- met een eenmalige bezoekcode die de winkel aan de klant geeft (QR-code bij de kassa). Eén review per aankoop of
-- bezoek, binnen 60 dagen. De verkoper kan openbaar reageren en een review melden; de beheerder beslist.
--
-- Marketing: kortingscodes, een actiebalk, volgers met winkelnieuws en een bezoekersteller.
-- Alleen tabellen en kolommen erbij; er wordt niets verwijderd.

-- --- Tabellen --------------------------------------------------------------------------------

alter table private.beoordelingen add column if not exists antwoord text not null default '';
alter table private.beoordelingen add column if not exists gemeld text not null default '';
alter table private.beoordelingen add column if not exists verborgen boolean not null default false;

create table if not exists private.bezoekcodes (
  id bigint generated always as identity primary key,
  verkoper bigint not null references private.gebruikers(id),
  code text not null unique,
  aangemaakt timestamptz not null default now(),
  geldig_tot timestamptz not null default now() + interval '14 days',
  bezoeker bigint references private.gebruikers(id),
  bevestigd timestamptz
);
create index if not exists bezoekcodes_bezoeker on private.bezoekcodes (bezoeker);

create table if not exists private.bezoek_beoordelingen (
  id bigint generated always as identity primary key,
  bezoek_id bigint not null unique references private.bezoekcodes(id),
  door bigint not null references private.gebruikers(id),
  over bigint not null references private.gebruikers(id),
  sterren integer not null check (sterren between 1 and 5),
  tekst text not null default '',
  antwoord text not null default '',
  gemeld text not null default '',
  verborgen boolean not null default false,
  aangemaakt timestamptz not null default now()
);

create table if not exists private.kortingscodes (
  id bigint generated always as identity primary key,
  verkoper bigint not null references private.gebruikers(id),
  code text not null check (code ~ '^[A-Z0-9]{3,20}$'),
  procent integer check (procent between 1 and 90),
  bedrag numeric(8, 2) check (bedrag > 0),
  minimum numeric(8, 2) not null default 0,
  geldig_tot date,
  max_gebruik integer check (max_gebruik > 0),
  gebruikt integer not null default 0,
  actief boolean not null default true,
  aangemaakt timestamptz not null default now(),
  unique (verkoper, code),
  check ((procent is null) <> (bedrag is null))
);

alter table private.bestellingen add column if not exists korting numeric(8, 2) not null default 0;
alter table private.bestellingen add column if not exists kortingscode text not null default '';

alter table private.winkels add column if not exists actie text not null default '';
alter table private.winkels add column if not exists actie_tot date;
alter table private.winkels add column if not exists bezoeken integer not null default 0;

create table if not exists private.winkel_volgers (
  verkoper bigint not null references private.gebruikers(id),
  volger bigint not null references private.gebruikers(id),
  actief boolean not null default true,
  sinds timestamptz not null default now(),
  primary key (verkoper, volger)
);

create table if not exists private.winkel_nieuws (
  id bigint generated always as identity primary key,
  verkoper bigint not null references private.gebruikers(id),
  tekst text not null,
  verborgen boolean not null default false,
  aangemaakt timestamptz not null default now()
);

-- --- Hulpfuncties ----------------------------------------------------------------------------

-- Alle zichtbare reviews over een verkoper: van kopers (aankoop) en van bezoekers (bezoek).
create or replace function private.reviews_over(p_id bigint)
returns table (soort text, id bigint, door bigint, sterren integer, tekst text, antwoord text, aangemaakt timestamptz)
language sql stable security definer set search_path to '' as $$
  select 'aankoop', r.id, r.door, r.sterren, r.tekst, r.antwoord, r.aangemaakt
  from private.beoordelingen r join private.bestellingen b on b.id = r.bestelling_id
  where r.over = p_id and r.door = b.koper and not r.verborgen
  union all
  select 'bezoek', r.id, r.door, r.sterren, r.tekst, r.antwoord, r.aangemaakt
  from private.bezoek_beoordelingen r where r.over = p_id and not r.verborgen
$$;

-- Betrouwbaarheid: sterren tellen nu ook bezoeken mee; verborgen reviews niet.
create or replace function private.vertrouwen(p_id bigint)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object(
    'lid_sinds', g.aangemaakt,
    'nieuw', g.aangemaakt > now() - interval '7 days',
    'sterren', (select round(avg(s), 1) from (
                  select sterren as s from private.beoordelingen where over = p_id and not verborgen
                  union all select sterren from private.bezoek_beoordelingen where over = p_id and not verborgen) x),
    'beoordelingen', (select count(*) from private.beoordelingen where over = p_id and not verborgen)
                     + (select count(*) from private.bezoek_beoordelingen where over = p_id and not verborgen),
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

-- De winkel zoals iedereen hem ziet, nu met de actiebalk (alleen zolang de actie loopt).
create or replace function private.winkel_json(w private.winkels)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('adres', w.adres, 'naam', w.naam, 'omschrijving', w.omschrijving, 'kleur', w.kleur,
                            'verzendkosten', w.verzendkosten, 'gratis_vanaf', w.gratis_vanaf, 'retour', w.retour,
                            'open', w.open, 'winkeladres', w.winkeladres, 'lat', w.lat, 'lon', w.lon,
                            'actie', case when w.actie_tot is null or w.actie_tot >= current_date then w.actie else '' end,
                            'actie_tot', w.actie_tot,
                            'volgers', (select count(*) from private.winkel_volgers v where v.verkoper = w.gebruiker_id and v.actief))
$$;

-- Korting op de producten (niet op verzendkosten). Geeft 0 of een foutmelding als de code niet geldt.
create or replace function private.korting_berekenen(p_verkoper bigint, p_code text, p_subtotaal numeric,
                                                     out korting numeric, out fout text, out code_id bigint)
language plpgsql stable security definer set search_path to '' as $$
declare k private.kortingscodes;
begin
  korting := 0;
  if coalesce(trim(p_code), '') = '' then return; end if;
  select * into k from private.kortingscodes where verkoper = p_verkoper and code = upper(trim(p_code)) and actief;
  if k.id is null then fout := 'Deze kortingscode bestaat niet (meer).'; return; end if;
  if k.geldig_tot is not null and k.geldig_tot < current_date then fout := 'Deze kortingscode is verlopen.'; return; end if;
  if k.max_gebruik is not null and k.gebruikt >= k.max_gebruik then fout := 'Deze kortingscode is op.'; return; end if;
  if p_subtotaal < k.minimum then
    fout := format('Deze kortingscode geldt vanaf € %s.', replace(to_char(k.minimum, 'FM999990.00'), '.', ','));
    return;
  end if;
  korting := least(p_subtotaal, coalesce(k.bedrag, round(p_subtotaal * k.procent / 100, 2)));
  code_id := k.id;
end; $$;

-- Voorraad en kortingscode terug bij een geannuleerde of verlopen webshopbestelling.
create or replace function private.voorraad_terug()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.webshop and new.status = 'geannuleerd' and old.status <> 'geannuleerd' then
    update private.aanbod set voorraad = voorraad + new.aantal where id = new.aanbod_id and voorraad is not null;
    if new.kortingscode <> '' then
      update private.kortingscodes set gebruikt = greatest(gebruikt - 1, 0)
      where verkoper = new.verkoper and code = new.kortingscode;
    end if;
  end if;
  return new;
end; $$;

-- --- Reviews --------------------------------------------------------------------------------

-- De winkel maakt een eenmalige bezoekcode voor een klant die in de winkel is geweest.
create or replace function public.bezoekcode_maken(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_code text;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if not exists (select 1 from private.winkels where gebruiker_id = v_id) then
    return jsonb_build_object('fout', 'Maak eerst je winkel aan.');
  end if;
  if (select count(*) from private.bezoekcodes where verkoper = v_id and aangemaakt > now() - interval '1 day') >= 200 then
    return jsonb_build_object('fout', 'Je hebt vandaag al 200 bezoekcodes gemaakt.');
  end if;
  v_code := upper(substr(translate(encode(extensions.gen_random_bytes(12), 'base64'), '+/=0O1Il', ''), 1, 10));
  insert into private.bezoekcodes (verkoper, code) values (v_id, v_code);
  return jsonb_build_object('ok', true, 'code', v_code, 'geldig_tot', now() + interval '14 days');
end; $$;

-- De klant bevestigt het bezoek met de code; daarna kan hij 60 dagen lang een review schrijven.
create or replace function public.bezoek_bevestigen(p_naam text, p_wachtwoord text, p_code text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); b private.bezoekcodes; w private.winkels;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into b from private.bezoekcodes where code = upper(trim(coalesce(p_code, ''))) for update;
  if b.id is null then return jsonb_build_object('fout', 'Deze bezoekcode klopt niet.'); end if;
  select * into w from private.winkels where gebruiker_id = b.verkoper;
  if b.bezoeker = v_id then return jsonb_build_object('ok', true, 'id', b.id, 'winkel', w.naam, 'adres', w.adres); end if;
  if b.bezoeker is not null then return jsonb_build_object('fout', 'Deze bezoekcode is al gebruikt.'); end if;
  if b.geldig_tot < now() then return jsonb_build_object('fout', 'Deze bezoekcode is verlopen.'); end if;
  if b.verkoper = v_id then return jsonb_build_object('fout', 'Dit is een code van je eigen winkel.'); end if;
  update private.bezoekcodes set bezoeker = v_id, bevestigd = now() where id = b.id;
  return jsonb_build_object('ok', true, 'id', b.id, 'winkel', w.naam, 'adres', w.adres);
end; $$;

-- Bezoeken waarover de klant nog een review kan schrijven.
create or replace function public.mijn_bezoeken(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object('bezoeken', coalesce((select jsonb_agg(jsonb_build_object(
      'id', b.id, 'winkel', w.naam, 'adres', w.adres, 'bevestigd', b.bevestigd) order by b.bevestigd desc)
    from private.bezoekcodes b join private.winkels w on w.gebruiker_id = b.verkoper
    where b.bezoeker = v_id and b.bevestigd > now() - interval '60 days'
      and not exists (select 1 from private.bezoek_beoordelingen r where r.bezoek_id = b.id)), '[]'::jsonb));
end; $$;

create or replace function public.winkel_beoordelen(p_naam text, p_wachtwoord text, p_bezoek bigint, p_sterren integer,
                                                    p_tekst text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); b private.bezoekcodes;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into b from private.bezoekcodes where id = p_bezoek and bezoeker = v_id;
  if b.id is null then return jsonb_build_object('fout', 'Je kunt alleen een review schrijven na een bevestigd bezoek.'); end if;
  if b.bevestigd < now() - interval '60 days' then
    return jsonb_build_object('fout', 'Een review kan tot 60 dagen na je bezoek.');
  end if;
  if p_sterren not between 1 and 5 then return jsonb_build_object('fout', 'Kies 1 tot 5 sterren.'); end if;
  insert into private.bezoek_beoordelingen (bezoek_id, door, over, sterren, tekst)
  values (b.id, v_id, b.verkoper, p_sterren, left(trim(coalesce(p_tekst, '')), 500))
  on conflict (bezoek_id) do nothing;
  if not found then return jsonb_build_object('fout', 'Je hebt dit bezoek al beoordeeld.'); end if;
  return jsonb_build_object('ok', true);
end; $$;

-- Reviews van een winkel, voor iedereen zichtbaar (ook zonder account).
create or replace function public.reviews_bekijken(p_adres text)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object(
    'sterren', (select round(avg(r.sterren), 1) from private.reviews_over(w.gebruiker_id) r),
    'aantal', (select count(*) from private.reviews_over(w.gebruiker_id) r),
    'verdeling', (select jsonb_object_agg(s, n) from (select r.sterren as s, count(*) as n
                  from private.reviews_over(w.gebruiker_id) r group by r.sterren) x),
    'reviews', coalesce((select jsonb_agg(jsonb_build_object(
        'soort', r.soort, 'id', r.id, 'sterren', r.sterren, 'tekst', r.tekst, 'antwoord', r.antwoord,
        'door', private.weergave(r.door), 'datum', r.aangemaakt) order by r.aangemaakt desc)
      from (select * from private.reviews_over(w.gebruiker_id) order by aangemaakt desc limit 50) r), '[]'::jsonb))
  from private.winkels w where w.adres = lower(trim(coalesce(p_adres, '')))
$$;

-- De verkoper reageert openbaar op een review over hem (bijvoorbeeld uitleg of excuses).
create or replace function public.review_antwoorden(p_naam text, p_wachtwoord text, p_soort text, p_id bigint,
                                                    p_tekst text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if p_soort = 'bezoek' then
    update private.bezoek_beoordelingen set antwoord = left(trim(coalesce(p_tekst, '')), 500) where id = p_id and over = v_id;
  else
    update private.beoordelingen set antwoord = left(trim(coalesce(p_tekst, '')), 500) where id = p_id and over = v_id;
  end if;
  if not found then return jsonb_build_object('fout', 'Review niet gevonden.'); end if;
  return jsonb_build_object('ok', true);
end; $$;

-- Melden: de review blijft staan tot de beheerder kijkt (zo kan een verkoper kritiek niet zelf weghalen).
create or replace function public.review_melden(p_naam text, p_wachtwoord text, p_soort text, p_id bigint, p_reden text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if trim(coalesce(p_reden, '')) = '' then return jsonb_build_object('fout', 'Schrijf waarom.'); end if;
  if p_soort = 'bezoek' then
    update private.bezoek_beoordelingen set gemeld = left(trim(p_reden), 500) where id = p_id and not verborgen;
  else
    update private.beoordelingen set gemeld = left(trim(p_reden), 500) where id = p_id and not verborgen;
  end if;
  return jsonb_build_object('ok', found);
end; $$;

create or replace function public.beheer_reviews(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is distinct from 1 then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object('reviews', coalesce((select jsonb_agg(x order by x->>'datum' desc) from (
      select jsonb_build_object('soort', 'aankoop', 'id', id, 'sterren', sterren, 'tekst', tekst, 'gemeld', gemeld,
                                'door', private.weergave(door), 'over', private.weergave(over), 'datum', aangemaakt) as x
      from private.beoordelingen where gemeld <> '' and not verborgen
      union all
      select jsonb_build_object('soort', 'bezoek', 'id', id, 'sterren', sterren, 'tekst', tekst, 'gemeld', gemeld,
                                'door', private.weergave(door), 'over', private.weergave(over), 'datum', aangemaakt)
      from private.bezoek_beoordelingen where gemeld <> '' and not verborgen) s), '[]'::jsonb));
end; $$;

create or replace function public.beheer_review_afhandelen(p_naam text, p_wachtwoord text, p_soort text, p_id bigint,
                                                           p_verbergen boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is distinct from 1 then return jsonb_build_object('geen_toegang', true); end if;
  if p_soort = 'bezoek' then
    update private.bezoek_beoordelingen set gemeld = '', verborgen = coalesce(p_verbergen, false) where id = p_id;
  else
    update private.beoordelingen set gemeld = '', verborgen = coalesce(p_verbergen, false) where id = p_id;
  end if;
  return jsonb_build_object('ok', found);
end; $$;

-- --- Marketing ------------------------------------------------------------------------------

create or replace function public.mijn_marketing(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); w private.winkels;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into w from private.winkels where gebruiker_id = v_id;
  if w.gebruiker_id is null then return jsonb_build_object('fout', 'Maak eerst je winkel aan.'); end if;
  return jsonb_build_object(
    'actie', w.actie, 'actie_tot', w.actie_tot, 'bezoeken', w.bezoeken,
    'volgers', (select count(*) from private.winkel_volgers where verkoper = v_id and actief),
    'codes', coalesce((select jsonb_agg(jsonb_build_object(
        'id', k.id, 'code', k.code, 'procent', k.procent, 'bedrag', k.bedrag, 'minimum', k.minimum,
        'geldig_tot', k.geldig_tot, 'max_gebruik', k.max_gebruik, 'gebruikt', k.gebruikt, 'actief', k.actief,
        'omzet', (select coalesce(sum(b.bedrag), 0) from private.bestellingen b where b.verkoper = v_id
                  and b.kortingscode = k.code and b.status in ('betaald', 'geleverd', 'afgerond'))) order by k.id desc)
      from private.kortingscodes k where k.verkoper = v_id), '[]'::jsonb),
    'nieuws', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'tekst', n.tekst, 'datum', n.aangemaakt)
                                         order by n.id desc)
      from (select * from private.winkel_nieuws where verkoper = v_id and not verborgen order by id desc limit 10) n), '[]'::jsonb),
    'bezoekcodes', (select jsonb_build_object('gemaakt', count(*), 'gebruikt', count(bezoeker))
                    from private.bezoekcodes where verkoper = v_id),
    'reviews', coalesce((select jsonb_agg(jsonb_build_object(
        'soort', r.soort, 'id', r.id, 'sterren', r.sterren, 'tekst', r.tekst, 'antwoord', r.antwoord,
        'door', private.weergave(r.door), 'datum', r.aangemaakt) order by r.aangemaakt desc)
      from (select * from private.reviews_over(v_id) order by aangemaakt desc limit 30) r), '[]'::jsonb),
    'verkopen_30d', (select jsonb_build_object('aantal', count(*), 'omzet', coalesce(sum(bedrag), 0))
                     from private.bestellingen where verkoper = v_id and webshop
                       and status in ('betaald', 'geleverd', 'afgerond') and aangemaakt > now() - interval '30 days'));
end; $$;

create or replace function public.kortingscode_opslaan(p_naam text, p_wachtwoord text, p_id bigint, p_code text,
                                                       p_procent integer, p_bedrag numeric, p_minimum numeric,
                                                       p_geldig_tot date, p_max_gebruik integer, p_actief boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_code text := upper(trim(coalesce(p_code, '')));
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if not exists (select 1 from private.winkels where gebruiker_id = v_id) then
    return jsonb_build_object('fout', 'Maak eerst je winkel aan.');
  end if;
  if p_id is not null then
    update private.kortingscodes set actief = coalesce(p_actief, actief) where id = p_id and verkoper = v_id;
    return jsonb_build_object('ok', found);
  end if;
  if v_code !~ '^[A-Z0-9]{3,20}$' then
    return jsonb_build_object('fout', 'Een kortingscode heeft 3 tot 20 letters of cijfers, zonder spaties.');
  end if;
  if (p_procent is null) = (p_bedrag is null) then return jsonb_build_object('fout', 'Kies een percentage of een bedrag.'); end if;
  if p_procent is not null and p_procent not between 1 and 90 then
    return jsonb_build_object('fout', 'Kies een korting van 1 tot 90 procent.');
  end if;
  if p_bedrag is not null and p_bedrag <= 0 then return jsonb_build_object('fout', 'Kies een bedrag boven 0.'); end if;
  if (select count(*) from private.kortingscodes where verkoper = v_id and actief) >= 20 then
    return jsonb_build_object('fout', 'Je kunt maximaal 20 actieve kortingscodes hebben.');
  end if;
  insert into private.kortingscodes (verkoper, code, procent, bedrag, minimum, geldig_tot, max_gebruik)
  values (v_id, v_code, p_procent, p_bedrag, greatest(coalesce(p_minimum, 0), 0), p_geldig_tot, p_max_gebruik)
  on conflict (verkoper, code) do nothing;
  if not found then return jsonb_build_object('fout', 'Deze code bestaat al in je winkel.'); end if;
  return jsonb_build_object('ok', true);
end; $$;

-- Laat de klant vooraf zien wat een code oplevert (ook zonder account).
create or replace function public.kortingscode_controleren(p_adres text, p_code text, p_subtotaal numeric)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare w private.winkels; k record;
begin
  select * into w from private.winkels where adres = lower(trim(coalesce(p_adres, ''))) and open;
  if w.gebruiker_id is null then return jsonb_build_object('fout', 'Deze winkel is gesloten.'); end if;
  select * into k from private.korting_berekenen(w.gebruiker_id, p_code, coalesce(p_subtotaal, 0));
  if k.fout is not null then return jsonb_build_object('fout', k.fout); end if;
  return jsonb_build_object('ok', true, 'korting', k.korting);
end; $$;

create or replace function public.winkel_actie(p_naam text, p_wachtwoord text, p_tekst text, p_tot date)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  update private.winkels set actie = left(trim(coalesce(p_tekst, '')), 140), actie_tot = p_tot where gebruiker_id = v_id;
  if not found then return jsonb_build_object('fout', 'Maak eerst je winkel aan.'); end if;
  return jsonb_build_object('ok', true);
end; $$;

-- Nieuwtje voor volgers: hooguit één per dag, zodat niemand wordt overspoeld.
create or replace function public.winkel_nieuws_plaatsen(p_naam text, p_wachtwoord text, p_tekst text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if not exists (select 1 from private.winkels where gebruiker_id = v_id and open) then
    return jsonb_build_object('fout', 'Je winkel moet open zijn om nieuws te delen.');
  end if;
  if trim(coalesce(p_tekst, '')) = '' then return jsonb_build_object('fout', 'Schrijf je nieuwtje.'); end if;
  if exists (select 1 from private.winkel_nieuws where verkoper = v_id and aangemaakt > now() - interval '20 hours') then
    return jsonb_build_object('fout', 'Je kunt één nieuwtje per dag delen, zodat je volgers niet overspoeld worden.');
  end if;
  insert into private.winkel_nieuws (verkoper, tekst) values (v_id, left(trim(p_tekst), 500));
  return jsonb_build_object('ok', true);
end; $$;

create or replace function public.winkel_nieuws_weg(p_naam text, p_wachtwoord text, p_id bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  update private.winkel_nieuws set verborgen = true where id = p_id and verkoper = v_id;
  return jsonb_build_object('ok', found);
end; $$;

create or replace function public.winkel_volgen(p_naam text, p_wachtwoord text, p_adres text, p_aan boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_verkoper bigint;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select gebruiker_id into v_verkoper from private.winkels where adres = lower(trim(coalesce(p_adres, '')));
  if v_verkoper is null then return jsonb_build_object('fout', 'Winkel niet gevonden.'); end if;
  if v_verkoper = v_id then return jsonb_build_object('fout', 'Dit is je eigen winkel.'); end if;
  insert into private.winkel_volgers (verkoper, volger, actief) values (v_verkoper, v_id, coalesce(p_aan, true))
  on conflict (verkoper, volger) do update set actief = excluded.actief;
  return jsonb_build_object('ok', true);
end; $$;

-- Nieuws van de winkels die je volgt (laatste 30 dagen) en welke winkels dat zijn.
create or replace function public.mijn_winkelnieuws(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object(
    'volgt', coalesce((select jsonb_agg(w.adres) from private.winkel_volgers v
                       join private.winkels w on w.gebruiker_id = v.verkoper where v.volger = v_id and v.actief), '[]'::jsonb),
    'nieuws', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'tekst', n.tekst, 'datum', n.aangemaakt,
                                                            'winkel', w.naam, 'adres', w.adres, 'kleur', w.kleur)
                                         order by n.aangemaakt desc)
      from private.winkel_nieuws n join private.winkel_volgers v on v.verkoper = n.verkoper and v.volger = v_id and v.actief
      join private.winkels w on w.gebruiker_id = n.verkoper and w.open
      where not n.verborgen and n.aangemaakt > now() - interval '30 days'), '[]'::jsonb));
end; $$;

-- Teller: één keer per bezoek aan de winkelpagina (de app telt niet dubbel binnen een sessie).
create or replace function public.winkel_bezocht(p_adres text)
returns boolean language sql security definer set search_path to '' as $$
  with geteld as (update private.winkels set bezoeken = bezoeken + 1
                  where adres = lower(trim(coalesce(p_adres, ''))) and open returning 1)
  select exists (select 1 from geteld)
$$;

-- Bestellen in de webshop, nu met een kortingscode. De oude versie (zonder code) roept deze aan.
create or replace function public.webshop_bestellen(p_naam text, p_wachtwoord text, p_aanbod bigint, p_aantal integer,
                                                    p_levering text, p_bericht text, p_code text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_a private.aanbod; w private.winkels;
        v_verzend numeric; v_bedrag numeric; v_best bigint; v_aantal integer := coalesce(p_aantal, 1);
        v_sub numeric; k record;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  perform private.webshop_opruimen();
  select * into v_a from private.aanbod where id = p_aanbod and in_winkel and not geblokkeerd for update;
  select * into w from private.winkels where gebruiker_id = v_a.gebruiker_id and open;
  if v_a.id is null or w.gebruiker_id is null then
    return jsonb_build_object('fout', 'Dit product is niet meer te koop.');
  end if;
  if v_a.gebruiker_id = v_id then return jsonb_build_object('fout', 'Dit is je eigen product.'); end if;
  if v_id <> 1 and not exists (select 1 from private.gebruikers where id = v_id and email is not null) then
    return jsonb_build_object('fout', 'Vul eerst je mailadres in bij Instellingen › Account.');
  end if;
  if not private.winkel_kan_betalen(v_a.gebruiker_id) then
    return jsonb_build_object('fout', 'Deze winkel kan nu geen betalingen ontvangen. Probeer het later opnieuw.');
  end if;
  if v_aantal not between 1 and 99 then return jsonb_build_object('fout', 'Kies een aantal van 1 tot 99.'); end if;
  if p_levering not in ('verzenden', 'ophalen') or not p_levering = any(v_a.levering) then
    return jsonb_build_object('fout', 'De verkoper biedt deze manier van leveren niet aan.');
  end if;
  if v_a.voorraad is null then
    if not v_a.actief then return jsonb_build_object('fout', 'Dit product is uitverkocht.'); end if;
    if v_aantal > 1 then return jsonb_build_object('fout', 'Hiervan is er maar één.'); end if;
    if exists (select 1 from private.bestellingen where aanbod_id = v_a.id
               and status in ('aangevraagd', 'geaccepteerd', 'betaald', 'geleverd')) then
      return jsonb_build_object('fout', 'Iemand anders is dit net aan het kopen.');
    end if;
  elsif v_a.voorraad < v_aantal then
    return jsonb_build_object('fout', case when v_a.voorraad = 0 then 'Dit product is uitverkocht.'
                                           else format('Er zijn er nog maar %s.', v_a.voorraad) end);
  end if;
  if (select count(*) from private.bestellingen where koper = v_id and status in ('aangevraagd', 'geaccepteerd'))
     >= (case when (select aangemaakt > now() - interval '7 days' from private.gebruikers where id = v_id) then 3 else 10 end) then
    return jsonb_build_object('fout', 'Je hebt al veel openstaande bestellingen. Rond die eerst af of annuleer ze.');
  end if;
  v_sub := v_a.prijs * v_aantal;
  select * into k from private.korting_berekenen(v_a.gebruiker_id, p_code, v_sub);
  if k.fout is not null then return jsonb_build_object('fout', k.fout); end if;
  v_verzend := case when p_levering = 'verzenden'
                      and not (w.gratis_vanaf is not null and v_sub >= w.gratis_vanaf)
                    then w.verzendkosten else 0 end;
  v_bedrag := v_sub - k.korting + v_verzend;
  if v_bedrag < 1 then return jsonb_build_object('fout', 'Betalen via de app kan vanaf 1 euro.'); end if;
  update private.aanbod set voorraad = voorraad - v_aantal where id = v_a.id and voorraad is not null;
  if k.code_id is not null then
    update private.kortingscodes set gebruikt = gebruikt + 1 where id = k.code_id;
  end if;
  insert into private.bestellingen (aanbod_id, koper, verkoper, titel, bedrag, betaalwijze, levering, status,
                                    webshop, aantal, verzendkosten, commissie, kosten, korting, kortingscode)
  values (v_a.id, v_id, v_a.gebruiker_id, v_a.titel || case when v_aantal > 1 then format(' (%s×)', v_aantal) else '' end,
          v_bedrag, 'app', p_levering, 'geaccepteerd', true, v_aantal, v_verzend, private.commissie(v_bedrag), 0,
          k.korting, case when k.code_id is null then '' else upper(trim(p_code)) end)
  returning id into v_best;
  perform private.bericht(v_a.id, v_id, v_a.gebruiker_id,
    format('Webshopbestelling: %s× %s, %s', v_aantal, v_a.titel, replace(p_levering, '_', ' ')) ||
    case when k.korting > 0 then format(' (kortingscode %s: -€ %s)', upper(trim(p_code)),
                                        replace(to_char(k.korting, 'FM999990.00'), '.', ',')) else '' end ||
    case when coalesce(trim(p_bericht), '') <> '' then '. ' || left(trim(p_bericht), 1000) else '' end);
  return jsonb_build_object('ok', true, 'id', v_best, 'bedrag', v_bedrag, 'verzendkosten', v_verzend, 'korting', k.korting);
end; $$;

create or replace function public.webshop_bestellen(p_naam text, p_wachtwoord text, p_aanbod bigint, p_aantal integer,
                                                    p_levering text, p_bericht text)
returns jsonb language sql security definer set search_path to '' as $$
  select public.webshop_bestellen(p_naam, p_wachtwoord, p_aanbod, p_aantal, p_levering, p_bericht, '')
$$;

-- --- Rechten --------------------------------------------------------------------------------

revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function
  public.bezoekcode_maken(text, text), public.bezoek_bevestigen(text, text, text), public.mijn_bezoeken(text, text),
  public.winkel_beoordelen(text, text, bigint, integer, text), public.reviews_bekijken(text),
  public.review_antwoorden(text, text, text, bigint, text), public.review_melden(text, text, text, bigint, text),
  public.beheer_reviews(text, text), public.beheer_review_afhandelen(text, text, text, bigint, boolean),
  public.mijn_marketing(text, text),
  public.kortingscode_opslaan(text, text, bigint, text, integer, numeric, numeric, date, integer, boolean),
  public.kortingscode_controleren(text, text, numeric), public.winkel_actie(text, text, text, date),
  public.winkel_nieuws_plaatsen(text, text, text), public.winkel_nieuws_weg(text, text, bigint),
  public.winkel_volgen(text, text, text, boolean), public.mijn_winkelnieuws(text, text), public.winkel_bezocht(text),
  public.webshop_bestellen(text, text, bigint, integer, text, text, text),
  public.webshop_bestellen(text, text, bigint, integer, text, text)
  from public;
grant execute on function
  public.bezoekcode_maken(text, text), public.bezoek_bevestigen(text, text, text), public.mijn_bezoeken(text, text),
  public.winkel_beoordelen(text, text, bigint, integer, text), public.reviews_bekijken(text),
  public.review_antwoorden(text, text, text, bigint, text), public.review_melden(text, text, text, bigint, text),
  public.beheer_reviews(text, text), public.beheer_review_afhandelen(text, text, text, bigint, boolean),
  public.mijn_marketing(text, text),
  public.kortingscode_opslaan(text, text, bigint, text, integer, numeric, numeric, date, integer, boolean),
  public.kortingscode_controleren(text, text, numeric), public.winkel_actie(text, text, text, date),
  public.winkel_nieuws_plaatsen(text, text, text), public.winkel_nieuws_weg(text, text, bigint),
  public.winkel_volgen(text, text, text, boolean), public.mijn_winkelnieuws(text, text), public.winkel_bezocht(text),
  public.webshop_bestellen(text, text, bigint, integer, text, text, text),
  public.webshop_bestellen(text, text, bigint, integer, text, text)
  to anon, authenticated;
