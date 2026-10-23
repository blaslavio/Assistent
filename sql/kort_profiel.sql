-- Korte deellinks (app/?k=code) voor je winkel, boekingspagina, VR-ruimte of je profielkaart, en het profiel van
-- een contact met diens winkel, boekingspagina en (als die met jou gedeeld is) agenda.
-- Een profielkaart is alleen openbaar als je er zelf een korte link voor maakt.

create table if not exists private.korte_links (
  code text primary key check (code ~ '^[a-z0-9][a-z0-9-]{2,29}$'),
  gebruiker bigint not null references private.gebruikers(id),
  soort text not null check (soort in ('winkel', 'boek', 'ruimte', 'profiel')),
  sleutel text not null,
  kliks integer not null default 0,
  weg boolean not null default false,
  aangemaakt timestamptz not null default now()
);
alter table private.korte_links enable row level security;
create index if not exists korte_links_gebruiker on private.korte_links (gebruiker, soort, sleutel);

create or replace function private.kort_code()
returns text language plpgsql security definer set search_path to '' as $$
declare v_tekens text := 'abcdefghjkmnpqrstuvwxyz23456789'; v_code text;
begin
  loop
    v_code := '';
    for i in 1..5 loop
      v_code := v_code || substr(v_tekens, 1 + floor(random() * length(v_tekens))::int, 1);
    end loop;
    exit when not exists (select 1 from private.korte_links where code = v_code);
  end loop;
  return v_code;
end; $$;

-- Is dit van mij (en te delen)?
create or replace function private.kort_mag(p_id bigint, p_soort text, p_sleutel text)
returns boolean language sql stable security definer set search_path to '' as $$
  select case p_soort
    when 'winkel' then exists (select 1 from private.winkels where gebruiker_id = p_id and adres = p_sleutel)
    when 'boek' then exists (select 1 from private.boekpaginas where gebruiker_id = p_id and adres = p_sleutel)
    when 'ruimte' then p_sleutel ~ '^[0-9]{1,12}$' and exists (
      select 1 from private.ruimtes where gebruiker_id = p_id and id = p_sleutel::bigint and not weg)
    when 'profiel' then p_sleutel = p_id::text
    else false end
$$;

create or replace function public.kort_maken(p_naam text, p_wachtwoord text, p_soort text, p_sleutel text,
                                             p_code text default '')
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
  v_code text := lower(trim(coalesce(p_code, '')));
  v_bestaand private.korte_links;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if p_soort = 'profiel' then p_sleutel := v_id::text; end if;
  if not private.kort_mag(v_id, p_soort, p_sleutel) then
    return jsonb_build_object('fout', 'Dit kun je niet delen.');
  end if;
  select * into v_bestaand from private.korte_links
  where gebruiker = v_id and soort = p_soort and sleutel = p_sleutel and not weg order by aangemaakt desc limit 1;
  if v_code = '' then
    if v_bestaand.code is not null then return jsonb_build_object('code', v_bestaand.code); end if;
    v_code := private.kort_code();
  else
    if v_code !~ '^[a-z0-9][a-z0-9-]{2,29}$' then
      return jsonb_build_object('fout', 'Kies 3 tot 30 tekens: kleine letters, cijfers of een streepje.');
    end if;
    if v_code = v_bestaand.code then return jsonb_build_object('code', v_code); end if;
    if exists (select 1 from private.korte_links where code = v_code) then
      return jsonb_build_object('fout', 'Deze link is al bezet. Kies een andere.');
    end if;
    if (select count(*) from private.korte_links where gebruiker = v_id and not weg) >= 50 then
      return jsonb_build_object('fout', 'Je hebt al 50 korte links.');
    end if;
  end if;
  insert into private.korte_links (code, gebruiker, soort, sleutel) values (v_code, v_id, p_soort, p_sleutel);
  return jsonb_build_object('code', v_code);
end; $$;

create or replace function public.mijn_korte_links(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object('links', coalesce((
    select jsonb_agg(jsonb_build_object('code', code, 'soort', soort, 'sleutel', sleutel, 'kliks', kliks)
                     order by aangemaakt desc)
    from private.korte_links where gebruiker = v_id and not weg), '[]'::jsonb));
end; $$;

create or replace function public.kort_weg(p_naam text, p_wachtwoord text, p_code text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  update private.korte_links set weg = true where code = lower(p_code) and gebruiker = v_id;
  return jsonb_build_object('ok', true);
end; $$;

-- Wat iemand openbaar heeft: open winkel, actieve boekingspagina, openbare VR-ruimtes.
create or replace function private.openbaar_profiel(p_id bigint)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object(
    'id', g.id, 'naam', coalesce(nullif(g.weergavenaam, ''), g.naam, ''), 'gebruikersnaam', coalesce(g.naam, ''),
    'winkel', (select jsonb_build_object('adres', w.adres, 'naam', w.naam, 'omschrijving', w.omschrijving,
                                         'kleur', w.kleur)
               from private.winkels w where w.gebruiker_id = g.id and w.open),
    'boek', (select jsonb_build_object('adres', b.adres, 'titel', b.titel, 'intro', b.intro, 'soorten', b.soorten)
             from private.boekpaginas b where b.gebruiker_id = g.id and b.aan),
    'ruimtes', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'titel', r.titel) order by r.bijgewerkt desc)
                         from (select * from private.ruimtes r where r.gebruiker_id = g.id and r.openbaar
                               and not r.verborgen and not r.weg order by r.bijgewerkt desc limit 5) r), '[]'::jsonb))
  from private.gebruikers g where g.id = p_id and not g.geblokkeerd and not g.verwijderd
$$;

-- Een korte link openen; mag zonder account. Telt het aantal keer.
create or replace function public.kort_openen(p_code text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare l private.korte_links;
begin
  update private.korte_links set kliks = kliks + 1 where code = lower(trim(coalesce(p_code, ''))) and not weg
  returning * into l;
  if l.code is null then return jsonb_build_object('fout', 'Deze link bestaat niet (meer).'); end if;
  if l.soort = 'profiel' then
    return jsonb_build_object('soort', 'profiel', 'profiel', private.openbaar_profiel(l.gebruiker) - 'id');
  end if;
  if not private.kort_mag(l.gebruiker, l.soort, l.sleutel) then
    return jsonb_build_object('fout', 'Deze link werkt niet meer.');
  end if;
  return jsonb_build_object('soort', l.soort, 'sleutel', l.sleutel);
end; $$;

-- Het profiel van een ander (vanuit de chat of je contacten): winkel, boekingspagina, ruimtes, en de agenda
-- alleen als die persoon zijn agenda met jou deelt.
create or replace function public.profiel_bekijken(p_naam text, p_wachtwoord text, p_wie bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_profiel jsonb;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  v_profiel := private.openbaar_profiel(p_wie);
  if v_profiel is null then return jsonb_build_object('fout', 'Dit profiel bestaat niet (meer).'); end if;
  return v_profiel || jsonb_build_object(
    'agenda', (select niveau from private.agenda_delen where eigenaar = p_wie and met = v_id and actief));
end; $$;

revoke all on function public.kort_maken(text, text, text, text, text), public.mijn_korte_links(text, text),
  public.kort_weg(text, text, text), public.kort_openen(text), public.profiel_bekijken(text, text, bigint)
  from public;
grant execute on function public.kort_maken(text, text, text, text, text), public.mijn_korte_links(text, text),
  public.kort_weg(text, text, text), public.kort_openen(text), public.profiel_bekijken(text, text, bigint)
  to anon, authenticated;
revoke all on function private.kort_code(), private.kort_mag(bigint, text, text), private.openbaar_profiel(bigint)
  from public, anon, authenticated;
