-- Agenda van een community: trainingen, wedstrijden en andere activiteiten. Leden geven aan of ze komen, nemen een
-- taak (rijden, bardienst, wassen) en regelen samen vervoer. Beheerders maken een selectie en zetten de uitslag.
-- Afwezig melden (ziek, blessure, vakantie) zet je meteen af voor alles in die periode, in één of al je community's;
-- meld je je beter, dan staan de komende activiteiten weer open.
--
-- Privacy: ziek of geblesseerd is gezondheidsinformatie. Standaard zien alleen beheerders die reden; andere leden zien
-- alleen "afwezig". Jij kiest zelf of iedereen de reden mag zien. Weghalen zet alleen een vlag en wist de tekst.

create table if not exists private.community_activiteiten (
  id bigint generated always as identity primary key,
  community bigint not null references private.chat_communities(id),
  maker bigint not null references private.gebruikers(id),
  soort text not null default 'training' check (soort in ('training', 'wedstrijd', 'evenement', 'vergadering', 'anders')),
  titel text not null check (length(titel) between 1 and 120),
  start timestamptz not null,
  einde timestamptz,
  verzamelen timestamptz,
  plaats text not null default '' check (length(plaats) <= 200),
  notitie text not null default '' check (length(notitie) <= 1000),
  tegenstander text not null default '' check (length(tegenstander) <= 120),
  thuis boolean,
  uitslag text not null default '' check (length(uitslag) <= 60),
  max_deelnemers integer check (max_deelnemers is null or max_deelnemers between 1 and 500),
  afgelast boolean not null default false,
  reeks bigint,
  aangemaakt timestamptz not null default now(),
  weg boolean not null default false
);
create index if not exists community_activiteiten_start on private.community_activiteiten (community, start) where not weg;

create table if not exists private.afwezig_meldingen (
  id bigint generated always as identity primary key,
  gebruiker bigint not null references private.gebruikers(id),
  soort text not null check (soort in ('ziek', 'blessure', 'vakantie', 'anders')),
  van date not null,
  tot date,
  reden_zien text not null default 'beheer' check (reden_zien in ('beheer', 'iedereen')),
  opmerking text not null default '' check (length(opmerking) <= 200),
  beter timestamptz,
  aangemaakt timestamptz not null default now(),
  weg boolean not null default false,
  check (tot is null or tot >= van)
);
create index if not exists afwezig_meldingen_gebruiker on private.afwezig_meldingen (gebruiker) where not weg;
create table if not exists private.afwezig_communities (
  afwezig bigint not null references private.afwezig_meldingen(id),
  community bigint not null references private.chat_communities(id),
  primary key (afwezig, community)
);
create index if not exists afwezig_communities_community on private.afwezig_communities (community);

create table if not exists private.community_aanwezig (
  activiteit bigint not null references private.community_activiteiten(id),
  gebruiker bigint not null references private.gebruikers(id),
  antwoord text check (antwoord is null or antwoord in ('ja', 'nee', 'misschien')),
  reden text check (reden is null or reden in ('ziek', 'blessure', 'vakantie', 'werk', 'anders')),
  opmerking text not null default '' check (length(opmerking) <= 200),
  afwezig bigint references private.afwezig_meldingen(id),
  selectie boolean not null default false,
  gewijzigd timestamptz not null default now(),
  primary key (activiteit, gebruiker)
);
create table if not exists private.community_taken (
  id bigint generated always as identity primary key,
  activiteit bigint not null references private.community_activiteiten(id),
  naam text not null check (length(naam) between 1 and 60),
  plekken integer not null default 1 check (plekken between 1 and 20),
  weg boolean not null default false
);
create index if not exists community_taken_activiteit on private.community_taken (activiteit) where not weg;
create table if not exists private.community_taak_wie (
  taak bigint not null references private.community_taken(id),
  gebruiker bigint not null references private.gebruikers(id),
  aan boolean not null default true,
  door bigint references private.gebruikers(id),
  gewijzigd timestamptz not null default now(),
  primary key (taak, gebruiker)
);
create table if not exists private.community_vervoer (
  activiteit bigint not null references private.community_activiteiten(id),
  gebruiker bigint not null references private.gebruikers(id),
  rol text check (rol is null or rol in ('rijdt', 'meerijden')),
  plaatsen integer not null default 0 check (plaatsen between 0 and 8),
  gewijzigd timestamptz not null default now(),
  primary key (activiteit, gebruiker)
);

alter table private.community_activiteiten enable row level security;
alter table private.afwezig_meldingen enable row level security;
alter table private.afwezig_communities enable row level security;
alter table private.community_aanwezig enable row level security;
alter table private.community_taken enable row level security;
alter table private.community_taak_wie enable row level security;
alter table private.community_vervoer enable row level security;

-- --- Hulpjes --------------------------------------------------------------------------------------------------------

create or replace function private.ca_beheer(p_ik bigint, p_community bigint)
returns boolean language sql stable security definer set search_path to '' as $$
  select coalesce(private.chat_community_rol(p_ik, p_community) in ('eigenaar', 'beheerder'), false)
$$;

-- Mag p_ik de reden zien? Jezelf en beheerders altijd; anderen alleen bij een reden die niets over gezondheid zegt,
-- of als de melder koos dat iedereen het mag zien.
create or replace function private.ca_reden(p_ik bigint, p_community bigint, p_van bigint, p_reden text, p_melding bigint)
returns text language sql stable security definer set search_path to '' as $$
  select case when p_reden is null then null
              when p_ik = p_van or private.ca_beheer(p_ik, p_community) then p_reden
              when p_reden not in ('ziek', 'blessure') then p_reden
              when exists (select 1 from private.afwezig_meldingen m where m.id = p_melding and m.reden_zien = 'iedereen') then p_reden
              else 'afwezig' end
$$;

-- Zet de afwezigheid door naar alle komende activiteiten in de periode (in de community's van de melding).
create or replace function private.afwezig_toepassen(p_melding bigint)
returns void language plpgsql security definer set search_path to '' as $$
declare m private.afwezig_meldingen;
begin
  select * into m from private.afwezig_meldingen where id = p_melding;
  -- Eerst wat deze melding eerder afzette maar nu buiten de periode valt weer openzetten.
  update private.community_aanwezig a set antwoord = null, reden = null, afwezig = null, gewijzigd = now()
  from private.community_activiteiten x
  where x.id = a.activiteit and a.afwezig = p_melding and x.start > now()
    and (m.weg or m.beter is not null or (x.start at time zone 'Europe/Amsterdam')::date < m.van
         or (m.tot is not null and (x.start at time zone 'Europe/Amsterdam')::date > m.tot));
  if m.weg or m.beter is not null then return; end if;
  insert into private.community_aanwezig (activiteit, gebruiker, antwoord, reden, afwezig)
  select x.id, m.gebruiker, 'nee', case when m.soort = 'anders' then 'anders' else m.soort end, m.id
  from private.community_activiteiten x
  join private.afwezig_communities c on c.afwezig = m.id and c.community = x.community
  where not x.weg and x.start > now()
    and (x.start at time zone 'Europe/Amsterdam')::date >= m.van
    and (m.tot is null or (x.start at time zone 'Europe/Amsterdam')::date <= m.tot)
    and private.chat_community_rol(m.gebruiker, x.community) is not null
  on conflict (activiteit, gebruiker) do update set antwoord = 'nee', reden = excluded.reden, afwezig = excluded.afwezig,
    selectie = false, gewijzigd = now();
end; $$;

create or replace function private.ca_activiteit_json(x private.community_activiteiten, p_ik bigint)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('id', x.id, 'soort', x.soort, 'titel', x.titel, 'start', x.start, 'einde', x.einde,
    'verzamelen', x.verzamelen, 'plaats', x.plaats, 'notitie', x.notitie, 'tegenstander', x.tegenstander, 'thuis', x.thuis,
    'uitslag', x.uitslag, 'max_deelnemers', x.max_deelnemers, 'afgelast', x.afgelast, 'reeks', x.reeks,
    'mag_bewerken', x.maker = p_ik or private.ca_beheer(p_ik, x.community),
    'antwoorden', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.gebruiker, 'naam', private.weergave(l.gebruiker), 'ik', l.gebruiker = p_ik,
        'antwoord', a.antwoord, 'reden', private.ca_reden(p_ik, x.community, l.gebruiker, a.reden, a.afwezig),
        'opmerking', case when a.reden in ('ziek', 'blessure') and private.ca_reden(p_ik, x.community, l.gebruiker, a.reden, a.afwezig) = 'afwezig'
                          then '' else coalesce(a.opmerking, '') end,
        'selectie', coalesce(a.selectie, false)) order by private.weergave(l.gebruiker))
      from private.chat_community_leden l
      left join private.community_aanwezig a on a.activiteit = x.id and a.gebruiker = l.gebruiker
      where l.community = x.community and l.status = 'lid'), '[]'::jsonb),
    'taken', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'naam', t.naam, 'plekken', t.plekken,
        'wie', coalesce((select jsonb_agg(jsonb_build_object('id', w.gebruiker, 'naam', private.weergave(w.gebruiker)) order by w.gewijzigd)
                         from private.community_taak_wie w where w.taak = t.id and w.aan), '[]'::jsonb)) order by t.id)
      from private.community_taken t where t.activiteit = x.id and not t.weg), '[]'::jsonb),
    'vervoer', coalesce((
      select jsonb_agg(jsonb_build_object('id', v.gebruiker, 'naam', private.weergave(v.gebruiker), 'rol', v.rol,
        'plaatsen', v.plaatsen) order by v.gewijzigd)
      from private.community_vervoer v where v.activiteit = x.id and v.rol is not null), '[]'::jsonb))
$$;

-- --- Lezen ----------------------------------------------------------------------------------------------------------

create or replace function public.community_agenda(p_naam text, p_wachtwoord text, p_community bigint, p_van date, p_tot date)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_rol text;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  v_rol := private.chat_community_rol(v_id, p_community);
  if v_rol is null then return jsonb_build_object('fout', 'Alleen leden zien de agenda.'); end if;
  if p_tot < p_van or p_tot - p_van > 120 then return jsonb_build_object('fout', 'Kies een kortere periode.'); end if;
  return jsonb_build_object('rol', v_rol,
    'activiteiten', coalesce((
      select jsonb_agg(private.ca_activiteit_json(x, v_id) order by x.start)
      from private.community_activiteiten x
      where x.community = p_community and not x.weg
        and (x.start at time zone 'Europe/Amsterdam')::date between p_van and p_tot), '[]'::jsonb),
    'afwezig', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'gebruiker', m.gebruiker, 'naam', private.weergave(m.gebruiker),
        'van_mij', m.gebruiker = v_id, 'van', m.van, 'tot', m.tot,
        'soort', private.ca_reden(v_id, p_community, m.gebruiker, m.soort, m.id),
        'opmerking', case when private.ca_reden(v_id, p_community, m.gebruiker, m.soort, m.id) = 'afwezig' then '' else m.opmerking end)
        order by m.van)
      from private.afwezig_meldingen m join private.afwezig_communities c on c.afwezig = m.id and c.community = p_community
      where not m.weg and m.beter is null and m.van <= p_tot and (m.tot is null or m.tot >= p_van)
        and private.chat_community_rol(m.gebruiker, p_community) is not null), '[]'::jsonb));
end; $$;

-- Jouw eigen afwezig-meldingen die nog lopen, met de community's waarin ze gelden.
create or replace function public.mijn_afwezig(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object('meldingen', coalesce((
    select jsonb_agg(jsonb_build_object('id', m.id, 'soort', m.soort, 'van', m.van, 'tot', m.tot, 'reden_zien', m.reden_zien,
      'opmerking', m.opmerking,
      'communities', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'naam', c.naam))
                               from private.afwezig_communities ac join private.chat_communities c on c.id = ac.community
                               where ac.afwezig = m.id and not c.weg), '[]'::jsonb)) order by m.van)
    from private.afwezig_meldingen m
    where m.gebruiker = v_id and not m.weg and m.beter is null and (m.tot is null or m.tot >= current_date)), '[]'::jsonb));
end; $$;

-- --- Activiteiten ---------------------------------------------------------------------------------------------------

-- p_gegevens: soort, titel, start, einde, verzamelen, plaats, notitie, tegenstander, thuis, max_deelnemers, afgelast,
-- uitslag en taken (lijst met namen, zoals ["Rijden", "Bardienst"]). p_weken: hoe vaak wekelijks herhalen (0 = niet).
create or replace function public.community_activiteit_bewaren(p_naam text, p_wachtwoord text, p_community bigint, p_id bigint,
                                                                p_gegevens jsonb, p_weken integer)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); g jsonb := coalesce(p_gegevens, '{}'::jsonb);
  v_oud private.community_activiteiten; v_eerste bigint; v_nieuw bigint; i integer; v_taak text; v_taken text[];
  v_start timestamptz; v_einde timestamptz; v_verz timestamptz;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if private.chat_community_rol(v_id, p_community) is null then
    return jsonb_build_object('fout', 'Alleen leden zetten iets in de agenda.');
  end if;
  if exists (select 1 from private.chat_communities c where c.id = p_community and (c.weg or c.herinnering)) then
    return jsonb_build_object('fout', 'Deze community is gesloten.');
  end if;
  if coalesce(trim(g->>'titel'), '') = '' then return jsonb_build_object('fout', 'Geef de activiteit een naam.'); end if;
  begin
    v_start := (g->>'start')::timestamptz;
    v_einde := nullif(g->>'einde', '')::timestamptz;
    v_verz := nullif(g->>'verzamelen', '')::timestamptz;
  exception when others then
    return jsonb_build_object('fout', 'Die datum of tijd klopt niet.');
  end;
  if v_start is null then return jsonb_build_object('fout', 'Kies een datum en tijd.'); end if;
  if v_einde is not null and v_einde < v_start then return jsonb_build_object('fout', 'Het einde ligt voor het begin.'); end if;
  if v_verz is not null and (v_verz > v_start or v_verz < v_start - interval '1 day') then
    return jsonb_build_object('fout', 'Verzamelen moet op dezelfde dag voor het begin zijn.');
  end if;
  if coalesce(p_weken, 0) not between 0 and 26 then return jsonb_build_object('fout', 'Herhalen kan hooguit 26 weken.'); end if;
  select coalesce(array_agg(t order by n), '{}') into v_taken
  from (select left(trim(t), 60) t, min(n) n from jsonb_array_elements_text(coalesce(g->'taken', '[]'::jsonb)) with ordinality x(t, n)
        where trim(t) <> '' group by 1 order by 2 limit 10) s;

  if p_id is not null then
    select * into v_oud from private.community_activiteiten where id = p_id and community = p_community and not weg;
    if v_oud.id is null then return jsonb_build_object('fout', 'Deze activiteit bestaat niet meer.'); end if;
    if v_oud.maker <> v_id and not private.ca_beheer(v_id, p_community) then
      return jsonb_build_object('fout', 'Alleen wie het maakte of een beheerder past dit aan.');
    end if;
    update private.community_activiteiten set soort = coalesce(g->>'soort', soort), titel = left(trim(g->>'titel'), 120),
      start = v_start, einde = v_einde, verzamelen = v_verz, plaats = left(coalesce(g->>'plaats', ''), 200),
      notitie = left(coalesce(g->>'notitie', ''), 1000), tegenstander = left(coalesce(g->>'tegenstander', ''), 120),
      thuis = (g->>'thuis')::boolean, max_deelnemers = nullif(g->>'max_deelnemers', '')::integer,
      afgelast = coalesce((g->>'afgelast')::boolean, false), uitslag = left(coalesce(g->>'uitslag', ''), 60)
    where id = p_id;
    update private.community_taken set weg = true where activiteit = p_id and not weg and naam <> all (v_taken);
    foreach v_taak in array v_taken loop
      if not exists (select 1 from private.community_taken where activiteit = p_id and naam = v_taak and not weg) then
        insert into private.community_taken (activiteit, naam) values (p_id, v_taak);
      end if;
    end loop;
    perform private.afwezig_toepassen(m.id) from private.afwezig_meldingen m
      join private.afwezig_communities c on c.afwezig = m.id and c.community = p_community
      where not m.weg and m.beter is null;
    return jsonb_build_object('ok', true, 'ids', jsonb_build_array(p_id));
  end if;

  if (select count(*) from private.community_activiteiten where community = p_community and aangemaakt > now() - interval '1 day') + coalesce(p_weken, 0) >= 300 then
    return jsonb_build_object('fout', 'Vandaag is er al veel in de agenda gezet. Probeer het morgen weer.');
  end if;
  for i in 0..coalesce(p_weken, 0) loop
    insert into private.community_activiteiten (community, maker, soort, titel, start, einde, verzamelen, plaats, notitie,
      tegenstander, thuis, max_deelnemers, reeks)
    values (p_community, v_id, coalesce(g->>'soort', 'training'), left(trim(g->>'titel'), 120),
      v_start + make_interval(weeks => i), v_einde + make_interval(weeks => i), v_verz + make_interval(weeks => i),
      left(coalesce(g->>'plaats', ''), 200), left(coalesce(g->>'notitie', ''), 1000), left(coalesce(g->>'tegenstander', ''), 120),
      (g->>'thuis')::boolean, nullif(g->>'max_deelnemers', '')::integer, v_eerste)
    returning id into v_nieuw;
    if v_eerste is null then
      v_eerste := v_nieuw;
      if coalesce(p_weken, 0) > 0 then update private.community_activiteiten set reeks = v_nieuw where id = v_nieuw; end if;
    end if;
    foreach v_taak in array v_taken loop
      insert into private.community_taken (activiteit, naam) values (v_nieuw, v_taak);
    end loop;
  end loop;
  -- Wie al afwezig gemeld staat, staat bij de nieuwe activiteiten meteen op afwezig.
  perform private.afwezig_toepassen(m.id) from private.afwezig_meldingen m
    join private.afwezig_communities c on c.afwezig = m.id and c.community = p_community
    where not m.weg and m.beter is null;
  return jsonb_build_object('ok', true, 'ids', (select jsonb_agg(id order by start) from private.community_activiteiten
                                                  where id = v_eerste or reeks = v_eerste));
end; $$;

create or replace function public.community_activiteit_weg(p_naam text, p_wachtwoord text, p_id bigint, p_reeks boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); x private.community_activiteiten;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into x from private.community_activiteiten where id = p_id and not weg;
  if x.id is null then return jsonb_build_object('ok', true); end if;
  if x.maker <> v_id and not private.ca_beheer(v_id, x.community) then
    return jsonb_build_object('fout', 'Alleen wie het maakte of een beheerder haalt dit weg.');
  end if;
  update private.community_activiteiten set weg = true, notitie = ''
  where id = x.id or (p_reeks and x.reeks is not null and reeks = x.reeks and start >= x.start);
  return jsonb_build_object('ok', true);
end; $$;

-- --- Meedoen --------------------------------------------------------------------------------------------------------

create or replace function public.community_aanwezig_zetten(p_naam text, p_wachtwoord text, p_id bigint, p_antwoord text,
                                                             p_reden text, p_opmerking text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); x private.community_activiteiten;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into x from private.community_activiteiten where id = p_id and not weg;
  if x.id is null or private.chat_community_rol(v_id, x.community) is null then
    return jsonb_build_object('fout', 'Deze activiteit is er niet meer.');
  end if;
  if p_antwoord is not null and p_antwoord not in ('ja', 'nee', 'misschien') then return jsonb_build_object('fout', 'Kies ja, nee of misschien.'); end if;
  if p_reden is not null and p_reden not in ('ziek', 'blessure', 'vakantie', 'werk', 'anders') then p_reden := 'anders'; end if;
  if p_antwoord = 'ja' and x.max_deelnemers is not null and (select count(*) from private.community_aanwezig
      where activiteit = x.id and antwoord = 'ja' and gebruiker <> v_id) >= x.max_deelnemers then
    return jsonb_build_object('fout', 'Het zit vol. Zet je op misschien, dan zie je het als er plek vrijkomt.');
  end if;
  insert into private.community_aanwezig (activiteit, gebruiker, antwoord, reden, opmerking)
  values (x.id, v_id, p_antwoord, case when p_antwoord = 'nee' then p_reden end, left(coalesce(p_opmerking, ''), 200))
  on conflict (activiteit, gebruiker) do update set antwoord = excluded.antwoord, reden = excluded.reden,
    opmerking = excluded.opmerking, afwezig = null,
    selectie = private.community_aanwezig.selectie and excluded.antwoord is distinct from 'nee', gewijzigd = now();
  return jsonb_build_object('ok', true);
end; $$;

create or replace function public.community_selectie(p_naam text, p_wachtwoord text, p_id bigint, p_gebruiker bigint, p_aan boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); x private.community_activiteiten;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into x from private.community_activiteiten where id = p_id and not weg;
  if x.id is null or not private.ca_beheer(v_id, x.community) then
    return jsonb_build_object('fout', 'Alleen beheerders maken de selectie.');
  end if;
  if private.chat_community_rol(p_gebruiker, x.community) is null then return jsonb_build_object('fout', 'Die persoon is geen lid.'); end if;
  insert into private.community_aanwezig (activiteit, gebruiker, selectie) values (x.id, p_gebruiker, coalesce(p_aan, false))
  on conflict (activiteit, gebruiker) do update set selectie = coalesce(p_aan, false), gewijzigd = now();
  return jsonb_build_object('ok', true);
end; $$;

-- Een taak nemen of teruggeven. Voor jezelf altijd; iemand anders indelen kan alleen een beheerder.
create or replace function public.community_taak(p_naam text, p_wachtwoord text, p_taak bigint, p_gebruiker bigint, p_aan boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); t private.community_taken; v_c bigint; v_wie bigint;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into t from private.community_taken where id = p_taak and not weg;
  select community into v_c from private.community_activiteiten where id = t.activiteit and not weg;
  if t.id is null or v_c is null or private.chat_community_rol(v_id, v_c) is null then
    return jsonb_build_object('fout', 'Deze taak is er niet meer.');
  end if;
  v_wie := coalesce(p_gebruiker, v_id);
  if v_wie <> v_id and not private.ca_beheer(v_id, v_c) then return jsonb_build_object('fout', 'Alleen beheerders delen anderen in.'); end if;
  if private.chat_community_rol(v_wie, v_c) is null then return jsonb_build_object('fout', 'Die persoon is geen lid.'); end if;
  if p_aan and (select count(*) from private.community_taak_wie where taak = t.id and aan and gebruiker <> v_wie) >= t.plekken then
    return jsonb_build_object('fout', 'Deze taak is al vergeven.');
  end if;
  insert into private.community_taak_wie (taak, gebruiker, aan, door) values (t.id, v_wie, coalesce(p_aan, false), v_id)
  on conflict (taak, gebruiker) do update set aan = coalesce(p_aan, false), door = v_id, gewijzigd = now();
  return jsonb_build_object('ok', true);
end; $$;

-- Samen rijden: je rijdt (met hoeveel plekken) of je wilt meerijden. p_rol null haalt je eruit.
create or replace function public.community_vervoer_zetten(p_naam text, p_wachtwoord text, p_id bigint, p_rol text, p_plaatsen integer)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); x private.community_activiteiten;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into x from private.community_activiteiten where id = p_id and not weg;
  if x.id is null or private.chat_community_rol(v_id, x.community) is null then
    return jsonb_build_object('fout', 'Deze activiteit is er niet meer.');
  end if;
  if p_rol is not null and p_rol not in ('rijdt', 'meerijden') then return jsonb_build_object('fout', 'Kies rijden of meerijden.'); end if;
  insert into private.community_vervoer (activiteit, gebruiker, rol, plaatsen)
  values (x.id, v_id, p_rol, case when p_rol = 'rijdt' then least(greatest(coalesce(p_plaatsen, 3), 1), 8) else 0 end)
  on conflict (activiteit, gebruiker) do update set rol = excluded.rol, plaatsen = excluded.plaatsen, gewijzigd = now();
  return jsonb_build_object('ok', true);
end; $$;

-- --- Afwezig melden -------------------------------------------------------------------------------------------------

-- p_communities leeg of null: in al je community's. p_tot null: tot je je beter meldt.
create or replace function public.afwezig_melden(p_naam text, p_wachtwoord text, p_soort text, p_van date, p_tot date,
                                                 p_communities bigint[], p_reden_zien text, p_opmerking text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_m bigint;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if p_soort not in ('ziek', 'blessure', 'vakantie', 'anders') then return jsonb_build_object('fout', 'Kies waarom je er niet bent.'); end if;
  if p_van is null or p_van < current_date - 7 or p_van > current_date + 365 then return jsonb_build_object('fout', 'Kies een begindatum.'); end if;
  if p_tot is not null and (p_tot < p_van or p_tot > p_van + 365) then return jsonb_build_object('fout', 'Die einddatum klopt niet.'); end if;
  if (select count(*) from private.afwezig_meldingen where gebruiker = v_id and aangemaakt > now() - interval '1 day') >= 20 then
    return jsonb_build_object('fout', 'Je hebt vandaag al vaak iets gemeld. Pas een bestaande melding aan.');
  end if;
  if not exists (select 1 from private.chat_community_leden l where l.gebruiker = v_id and l.status = 'lid'
                 and (coalesce(cardinality(p_communities), 0) = 0 or l.community = any (p_communities))) then
    return jsonb_build_object('fout', 'Je bent nog geen lid van een community.');
  end if;
  insert into private.afwezig_meldingen (gebruiker, soort, van, tot, reden_zien, opmerking)
  values (v_id, p_soort, p_van, p_tot, case when p_reden_zien = 'iedereen' then 'iedereen' else 'beheer' end, left(coalesce(p_opmerking, ''), 200))
  returning id into v_m;
  insert into private.afwezig_communities (afwezig, community)
  select v_m, l.community from private.chat_community_leden l join private.chat_communities c on c.id = l.community and not c.weg
  where l.gebruiker = v_id and l.status = 'lid' and (coalesce(cardinality(p_communities), 0) = 0 or l.community = any (p_communities));
  perform private.afwezig_toepassen(v_m);
  return jsonb_build_object('ok', true, 'id', v_m,
    'afgemeld', (select count(*) from private.community_aanwezig where afwezig = v_m));
end; $$;

-- Aanpassen: een nieuwe einddatum, of beter melden (p_beter): dan staan de komende activiteiten weer open.
create or replace function public.afwezig_aanpassen(p_naam text, p_wachtwoord text, p_id bigint, p_tot date, p_beter boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); m private.afwezig_meldingen;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into m from private.afwezig_meldingen where id = p_id and gebruiker = v_id and not weg;
  if m.id is null then return jsonb_build_object('fout', 'Deze melding is er niet meer.'); end if;
  if p_beter then
    update private.afwezig_meldingen set beter = now(), tot = greatest(van, least(coalesce(tot, current_date), current_date)),
      weg = van > current_date
    where id = m.id;
  else
    if p_tot is not null and (p_tot < m.van or p_tot > m.van + 365) then return jsonb_build_object('fout', 'Die einddatum klopt niet.'); end if;
    update private.afwezig_meldingen set tot = p_tot where id = m.id;
  end if;
  perform private.afwezig_toepassen(m.id);
  return jsonb_build_object('ok', true);
end; $$;

-- --- Account weg: ook de agenda van community's opschonen ----------------------------------------------------------

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
  update private.document_versies v set titel = '', inhoud = null, html = '', tekst = ''
  from private.documenten d where d.id = v.document_id and d.gebruiker_id = v_id;
  update private.documenten set weg = true, gewist = true, titel = '', inhoud = null, html = '', tekst = ''
  where gebruiker_id = v_id;
  update private.transacties set weg = true, bedrag = 0, omschrijving = '', tegenpartij = '', rekening = ''
  where gebruiker_id = v_id;
  update private.bankkoppelingen set status = 'weg', sessie = '', rekeningen = '[]'::jsonb, staat = ''
  where gebruiker_id = v_id;
  update private.agenda_delen set actief = false where eigenaar = v_id or met = v_id;
  update private.agenda_reacties set weg = true, tekst = '' where door = v_id or eigenaar = v_id;
  update private.agenda_uitnodigingen set weg = true where eigenaar = v_id or gast = v_id;
  update private.afwezig_meldingen set weg = true, opmerking = '', soort = 'anders' where gebruiker = v_id;
  update private.community_aanwezig set antwoord = null, reden = null, opmerking = '', afwezig = null where gebruiker = v_id;
  update private.community_taak_wie set aan = false where gebruiker = v_id;
  update private.community_vervoer set rol = null where gebruiker = v_id;
  update private.project_leden set actief = false where gebruiker_id = v_id;
  update private.gebruikers set verwijderd = true, naam = null, email = null, weergavenaam = 'Verwijderd account',
         hash = extensions.crypt(extensions.gen_random_uuid()::text, extensions.gen_salt('bf', 4))
  where id = v_id;
  return true;
end; $$;

-- --- Rechten --------------------------------------------------------------------------------------------------------

revoke all on function private.ca_beheer(bigint, bigint), private.ca_reden(bigint, bigint, bigint, text, bigint),
  private.afwezig_toepassen(bigint), private.ca_activiteit_json(private.community_activiteiten, bigint)
  from public, anon, authenticated;
revoke all on function public.community_agenda(text, text, bigint, date, date), public.mijn_afwezig(text, text),
  public.community_activiteit_bewaren(text, text, bigint, bigint, jsonb, integer),
  public.community_activiteit_weg(text, text, bigint, boolean),
  public.community_aanwezig_zetten(text, text, bigint, text, text, text),
  public.community_selectie(text, text, bigint, bigint, boolean), public.community_taak(text, text, bigint, bigint, boolean),
  public.community_vervoer_zetten(text, text, bigint, text, integer),
  public.afwezig_melden(text, text, text, date, date, bigint[], text, text),
  public.afwezig_aanpassen(text, text, bigint, date, boolean), public.account_verwijderen(text, text) from public;
grant execute on function public.community_agenda(text, text, bigint, date, date), public.mijn_afwezig(text, text),
  public.community_activiteit_bewaren(text, text, bigint, bigint, jsonb, integer),
  public.community_activiteit_weg(text, text, bigint, boolean),
  public.community_aanwezig_zetten(text, text, bigint, text, text, text),
  public.community_selectie(text, text, bigint, bigint, boolean), public.community_taak(text, text, bigint, bigint, boolean),
  public.community_vervoer_zetten(text, text, bigint, text, integer),
  public.afwezig_melden(text, text, text, date, date, bigint[], text, text),
  public.afwezig_aanpassen(text, text, bigint, date, boolean), public.account_verwijderen(text, text) to anon, authenticated;
