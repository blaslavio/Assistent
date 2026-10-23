-- Potten: samen geld inzamelen voor een cadeau (bij een verjaardag), een spaardoel van een community of huishouden,
-- of donaties via een deelbare link. De app beweegt zelf geen geld: deelnemers maken over naar de rekening of
-- het betaalverzoek van de maker, zeggen "Ik heb betaald", en de maker vinkt "Ontvangen" aan.
-- Wie mag kijken: de maker, wie hij toevoegt, de leden van de gekoppelde community of het gekoppelde huishouden,
-- en (alleen als de maker dat aanzet) iedereen met de link.

create table if not exists private.potten (
  id bigint generated always as identity primary key,
  maker bigint not null references private.gebruikers(id),
  titel text not null,
  omschrijving text not null default '',
  soort text not null default 'cadeau' check (soort in ('cadeau', 'spaardoel', 'donatie')),
  doel numeric(10, 2) check (doel is null or doel between 1 and 1000000),
  iban text not null default '',
  tenaamstelling text not null default '',
  betaallink text not null default '' check (betaallink = '' or betaallink ~ '^https://'),
  einddatum date,
  community bigint references private.chat_communities(id),
  gezin bigint references private.gezinnen(id),
  afspraak text not null default '',
  openbaar boolean not null default false,
  code text not null unique,
  gesloten boolean not null default false,
  weg boolean not null default false,
  aangemaakt timestamptz not null default now()
);
create table if not exists private.pot_leden (
  pot bigint not null references private.potten(id),
  gebruiker bigint not null references private.gebruikers(id),
  door bigint references private.gebruikers(id),
  aangemaakt timestamptz not null default now(),
  primary key (pot, gebruiker)
);
create table if not exists private.pot_bijdragen (
  id bigint generated always as identity primary key,
  pot bigint not null references private.potten(id),
  gebruiker bigint references private.gebruikers(id),
  naam text not null default '',
  bedrag numeric(10, 2) not null check (bedrag between 0.5 and 100000),
  status text not null default 'toegezegd' check (status in ('toegezegd', 'betaald', 'ontvangen')),
  bericht text not null default '',
  anoniem boolean not null default false,
  weg boolean not null default false,
  aangemaakt timestamptz not null default now()
);
create index if not exists pot_bijdragen_pot on private.pot_bijdragen (pot) where not weg;
create index if not exists pot_leden_gebruiker on private.pot_leden (gebruiker);
alter table private.potten enable row level security;
alter table private.pot_leden enable row level security;
alter table private.pot_bijdragen enable row level security;

create or replace function private.pot_mag(p_id bigint, p_pot bigint)
returns boolean language sql stable security definer set search_path to '' as $$
  select exists (select 1 from private.potten p where p.id = p_pot and not p.weg and (
    p.maker = p_id
    or exists (select 1 from private.pot_leden l where l.pot = p.id and l.gebruiker = p_id)
    or (p.community is not null and exists (select 1 from private.chat_community_leden c
          where c.community = p.community and c.gebruiker = p_id and c.status = 'lid'))
    or (p.gezin is not null and private.gezin_lid(p_id, p.gezin))))
$$;

-- Een pot zoals je hem ziet. Namen van anonieme gevers ziet alleen de maker. Rekeningnummer en betaallink
-- alleen voor wie mag kijken (of iedereen bij een openbare pot).
create or replace function private.pot_json(p private.potten, p_id bigint)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('id', p.id, 'titel', p.titel, 'omschrijving', p.omschrijving, 'soort', p.soort,
    'doel', p.doel, 'iban', p.iban, 'tenaamstelling', p.tenaamstelling, 'betaallink', p.betaallink,
    'einddatum', p.einddatum, 'community', p.community, 'gezin', p.gezin, 'afspraak', p.afspraak,
    'openbaar', p.openbaar, 'code', p.code, 'gesloten', p.gesloten, 'maker', private.weergave(p.maker),
    'van_mij', p.maker = p_id,
    'ontvangen', coalesce((select sum(b.bedrag) from private.pot_bijdragen b where b.pot = p.id and not b.weg
                           and b.status = 'ontvangen'), 0),
    'toegezegd', coalesce((select sum(b.bedrag) from private.pot_bijdragen b where b.pot = p.id and not b.weg), 0),
    'gevers', (select count(distinct coalesce(b.gebruiker::text, b.naam)) from private.pot_bijdragen b
               where b.pot = p.id and not b.weg),
    'bijdragen', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'bedrag', b.bedrag, 'status', b.status,
        'bericht', b.bericht, 'anoniem', b.anoniem, 'van_mij', b.gebruiker = p_id, 'aangemaakt', b.aangemaakt,
        'naam', case when b.anoniem and p.maker <> p_id and b.gebruiker is distinct from p_id then 'Anoniem'
                     when b.gebruiker is not null then private.weergave(b.gebruiker) else b.naam end)
        order by b.aangemaakt desc)
      from private.pot_bijdragen b where b.pot = p.id and not b.weg), '[]'::jsonb),
    'leden', coalesce((select jsonb_agg(private.weergave(l.gebruiker)) from private.pot_leden l where l.pot = p.id),
                      '[]'::jsonb))
$$;

create or replace function public.pot_maken(p_naam text, p_wachtwoord text, p_titel text, p_omschrijving text,
  p_soort text, p_doel numeric, p_iban text, p_tenaamstelling text, p_betaallink text, p_einddatum date,
  p_leden text[], p_community bigint, p_gezin bigint, p_afspraak text, p_openbaar boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
  v_pot bigint;
  v_code text;
  v_iban text := upper(regexp_replace(coalesce(p_iban, ''), '\s', '', 'g'));
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if trim(coalesce(p_titel, '')) = '' then return jsonb_build_object('fout', 'Geef de pot een naam.'); end if;
  if coalesce(p_soort, '') not in ('cadeau', 'spaardoel', 'donatie') then
    return jsonb_build_object('fout', 'Kies cadeau, spaardoel of donatie.');
  end if;
  if v_iban <> '' and v_iban !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$' then
    return jsonb_build_object('fout', 'Dit rekeningnummer klopt niet.');
  end if;
  if coalesce(p_betaallink, '') <> '' and p_betaallink !~ '^https://' then
    return jsonb_build_object('fout', 'Een betaallink begint met https://');
  end if;
  if p_community is not null and not exists (select 1 from private.chat_community_leden
      where community = p_community and gebruiker = v_id and status = 'lid' and rol in ('eigenaar', 'beheerder')) then
    return jsonb_build_object('fout', 'Alleen beheerders van de community kunnen een pot voor iedereen maken.');
  end if;
  if p_gezin is not null and not private.gezin_lid(v_id, p_gezin) then
    return jsonb_build_object('fout', 'Geen toegang tot dit huishouden.');
  end if;
  if (select count(*) from private.potten where maker = v_id and aangemaakt > now() - interval '1 day') >= 20 then
    return jsonb_build_object('fout', 'Je hebt vandaag al veel potten gemaakt.');
  end if;
  loop
    v_code := encode(extensions.gen_random_bytes(6), 'hex');
    exit when not exists (select 1 from private.potten where code = v_code);
  end loop;
  insert into private.potten (maker, titel, omschrijving, soort, doel, iban, tenaamstelling, betaallink, einddatum,
                              community, gezin, afspraak, openbaar, code)
  values (v_id, left(trim(p_titel), 80), left(coalesce(p_omschrijving, ''), 1000), p_soort, p_doel, v_iban,
          left(coalesce(p_tenaamstelling, ''), 70), coalesce(p_betaallink, ''), p_einddatum, p_community, p_gezin,
          left(coalesce(p_afspraak, ''), 80), coalesce(p_openbaar, false), v_code)
  returning id into v_pot;
  perform private.pot_leden_erbij(v_id, v_pot, p_leden);
  return jsonb_build_object('ok', true, 'id', v_pot, 'code', v_code);
end; $$;

-- Mensen toevoegen op gebruikersnaam; zij krijgen een seintje.
create or replace function private.pot_leden_erbij(p_id bigint, p_pot bigint, p_leden text[])
returns integer language plpgsql security definer set search_path to '' as $$
declare v_gast bigint; v_aantal integer := 0; v_titel text := (select titel from private.potten where id = p_pot);
begin
  for v_gast in select g.id from private.gebruikers g
                where g.naam = any (select lower(trim(ltrim(x, '@'))) from unnest(coalesce(p_leden, '{}')) x)
                  and g.id <> p_id and not g.verwijderd and not g.geblokkeerd
  loop
    exit when (select count(*) from private.pot_leden where pot = p_pot) >= 200;
    insert into private.pot_leden (pot, gebruiker, door) values (p_pot, v_gast, p_id) on conflict do nothing;
    if found then
      v_aantal := v_aantal + 1;
      perform private.push_inplannen(v_gast, now(), 'uitnodiging', 'pot:' || p_pot,
        private.weergave(p_id) || ' zamelt in', v_titel);
    end if;
  end loop;
  return v_aantal;
end; $$;

create or replace function public.pot_leden_toevoegen(p_naam text, p_wachtwoord text, p_pot bigint, p_leden text[])
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if not private.pot_mag(v_id, p_pot) then return jsonb_build_object('fout', 'Geen toegang tot deze pot.'); end if;
  return jsonb_build_object('ok', true, 'toegevoegd', private.pot_leden_erbij(v_id, p_pot, p_leden));
end; $$;

create or replace function public.mijn_potten(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object('potten', coalesce((select jsonb_agg(private.pot_json(p, v_id) order by p.gesloten, p.aangemaakt desc)
    from private.potten p where not p.weg and private.pot_mag(v_id, p.id)
      and (not p.gesloten or p.aangemaakt > now() - interval '60 days')), '[]'::jsonb));
end; $$;

create or replace function public.pot_bekijken(p_naam text, p_wachtwoord text, p_pot bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); p private.potten;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if not private.pot_mag(v_id, p_pot) then return jsonb_build_object('fout', 'Geen toegang tot deze pot.'); end if;
  select * into p from private.potten where id = p_pot;
  return jsonb_build_object('pot', private.pot_json(p, v_id));
end; $$;

create or replace function public.pot_bijdragen(p_naam text, p_wachtwoord text, p_pot bigint, p_bedrag numeric,
                                                p_bericht text, p_anoniem boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); p private.potten; v_bijdrage bigint;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if not private.pot_mag(v_id, p_pot) then return jsonb_build_object('fout', 'Geen toegang tot deze pot.'); end if;
  select * into p from private.potten where id = p_pot;
  if p.gesloten then return jsonb_build_object('fout', 'Deze pot is gesloten.'); end if;
  if coalesce(p_bedrag, 0) < 0.5 or p_bedrag > 100000 then return jsonb_build_object('fout', 'Kies een bedrag.'); end if;
  if (select count(*) from private.pot_bijdragen where pot = p_pot and gebruiker = v_id and not weg) >= 20 then
    return jsonb_build_object('fout', 'Je hebt al vaak bijgedragen aan deze pot.');
  end if;
  insert into private.pot_bijdragen (pot, gebruiker, bedrag, bericht, anoniem)
  values (p_pot, v_id, round(p_bedrag, 2), left(coalesce(p_bericht, ''), 300), coalesce(p_anoniem, false))
  returning id into v_bijdrage;
  if p.maker <> v_id then
    perform private.push_inplannen(p.maker, now(), 'reactie', 'pot-bijdrage:' || v_bijdrage,
      case when p_anoniem then 'Iemand' else private.weergave(v_id) end || ' doet mee', p.titel);
  end if;
  return jsonb_build_object('ok', true, 'id', v_bijdrage);
end; $$;

-- Gever: "Ik heb betaald" (of weer terug naar toegezegd). Maker: "Ontvangen". Weghalen: gever of maker.
create or replace function public.pot_bijdrage_status(p_naam text, p_wachtwoord text, p_bijdrage bigint, p_status text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); b private.pot_bijdragen; p private.potten;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into b from private.pot_bijdragen where id = p_bijdrage and not weg;
  select * into p from private.potten where id = b.pot and not weg;
  if p.id is null then return jsonb_build_object('fout', 'Deze bijdrage bestaat niet (meer).'); end if;
  if p_status = 'weg' and (b.gebruiker = v_id or p.maker = v_id) and b.status <> 'ontvangen' then
    update private.pot_bijdragen set weg = true where id = b.id;
  elsif p_status in ('toegezegd', 'betaald') and b.gebruiker = v_id and b.status <> 'ontvangen' then
    update private.pot_bijdragen set status = p_status where id = b.id;
    if p_status = 'betaald' and p.maker <> v_id then
      perform private.push_inplannen(p.maker, now(), 'reactie', 'pot-betaald:' || b.id,
        case when b.anoniem then 'Iemand' else private.weergave(v_id) end || ' heeft betaald',
        p.titel || ': controleer of het binnen is');
    end if;
  elsif p_status in ('ontvangen', 'betaald') and p.maker = v_id then
    update private.pot_bijdragen set status = p_status where id = b.id;
  else
    return jsonb_build_object('fout', 'Dit kan niet.');
  end if;
  return jsonb_build_object('ok', true);
end; $$;

create or replace function public.pot_bijwerken(p_naam text, p_wachtwoord text, p_pot bigint, p_titel text,
  p_omschrijving text, p_doel numeric, p_iban text, p_tenaamstelling text, p_betaallink text, p_einddatum date,
  p_openbaar boolean, p_gesloten boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
  v_iban text := upper(regexp_replace(coalesce(p_iban, ''), '\s', '', 'g'));
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if v_iban <> '' and v_iban !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$' then
    return jsonb_build_object('fout', 'Dit rekeningnummer klopt niet.');
  end if;
  if coalesce(p_betaallink, '') <> '' and p_betaallink !~ '^https://' then
    return jsonb_build_object('fout', 'Een betaallink begint met https://');
  end if;
  update private.potten set titel = coalesce(nullif(left(trim(coalesce(p_titel, '')), 80), ''), titel),
    omschrijving = left(coalesce(p_omschrijving, ''), 1000), doel = p_doel, iban = v_iban,
    tenaamstelling = left(coalesce(p_tenaamstelling, ''), 70), betaallink = coalesce(p_betaallink, ''),
    einddatum = p_einddatum, openbaar = coalesce(p_openbaar, false), gesloten = coalesce(p_gesloten, false)
  where id = p_pot and maker = v_id and not weg;
  if not found then return jsonb_build_object('fout', 'Alleen de maker kan dit aanpassen.'); end if;
  return jsonb_build_object('ok', true);
end; $$;

create or replace function public.pot_weg(p_naam text, p_wachtwoord text, p_pot bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  update private.potten set weg = true where id = p_pot and maker = v_id;
  if not found then return jsonb_build_object('fout', 'Alleen de maker kan dit weghalen.'); end if;
  return jsonb_build_object('ok', true);
end; $$;

-- Openbare pot via de link (?pot=code): ook zonder account te zien en mee te doen (alleen als openbaar aan staat).
create or replace function public.pot_openbaar(p_code text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare p private.potten;
begin
  select * into p from private.potten where code = p_code and not weg and openbaar;
  if p.id is null then return jsonb_build_object('fout', 'Deze pot bestaat niet (meer) of is niet openbaar.'); end if;
  return jsonb_build_object('pot', private.pot_json(p, null) - 'bijdragen' - 'leden' - 'afspraak' - 'gezin'
    - 'community' || jsonb_build_object('bijdragen', coalesce((select jsonb_agg(jsonb_build_object(
        'bedrag', b.bedrag, 'bericht', b.bericht, 'aangemaakt', b.aangemaakt,
        'naam', case when b.anoniem then 'Anoniem' when b.gebruiker is not null then private.weergave(b.gebruiker)
                     else b.naam end) order by b.aangemaakt desc)
      from (select * from private.pot_bijdragen b where b.pot = p.id and not b.weg order by b.aangemaakt desc limit 30) b),
      '[]'::jsonb)));
end; $$;

create or replace function public.pot_doneren(p_code text, p_naam_gever text, p_bedrag numeric, p_bericht text,
                                              p_anoniem boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare p private.potten; v_bijdrage bigint;
begin
  select * into p from private.potten where code = p_code and not weg and openbaar;
  if p.id is null then return jsonb_build_object('fout', 'Deze pot bestaat niet (meer) of is niet openbaar.'); end if;
  if p.gesloten then return jsonb_build_object('fout', 'Deze pot is gesloten.'); end if;
  if coalesce(p_bedrag, 0) < 0.5 or p_bedrag > 100000 then return jsonb_build_object('fout', 'Kies een bedrag.'); end if;
  if trim(coalesce(p_naam_gever, '')) = '' and not coalesce(p_anoniem, false) then
    return jsonb_build_object('fout', 'Vul je naam in, of kies anoniem.');
  end if;
  if (select count(*) from private.pot_bijdragen where pot = p.id and gebruiker is null
      and aangemaakt > now() - interval '1 hour') >= 30 then
    return jsonb_build_object('fout', 'Het is even druk. Probeer het later opnieuw.');
  end if;
  insert into private.pot_bijdragen (pot, naam, bedrag, bericht, anoniem)
  values (p.id, left(trim(coalesce(p_naam_gever, '')), 60), round(p_bedrag, 2), left(coalesce(p_bericht, ''), 300),
          coalesce(p_anoniem, false))
  returning id into v_bijdrage;
  perform private.push_inplannen(p.maker, now(), 'reactie', 'pot-bijdrage:' || v_bijdrage,
    case when p_anoniem then 'Iemand' else left(trim(p_naam_gever), 60) end || ' doneert', p.titel);
  return jsonb_build_object('ok', true);
end; $$;

revoke all on function private.pot_mag(bigint, bigint), private.pot_json(private.potten, bigint),
  private.pot_leden_erbij(bigint, bigint, text[]) from public, anon, authenticated;
