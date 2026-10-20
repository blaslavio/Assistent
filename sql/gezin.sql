-- Gezinsagenda: samen bijhouden wie wat doet (halen, brengen, afspraken). Alleen leden die de uitnodiging
-- accepteerden zien de gezinsagenda. Wat aan jou is toegewezen, staat ook in je eigen agenda.

create table if not exists private.gezinnen (
  id bigint generated always as identity primary key,
  naam text not null,
  eigenaar bigint not null references private.gebruikers(id),
  kinderen jsonb not null default '[]'::jsonb,
  weg boolean not null default false,
  aangemaakt timestamptz not null default now()
);
create table if not exists private.gezin_leden (
  gezin_id bigint not null references private.gezinnen(id),
  gebruiker bigint not null references private.gebruikers(id),
  status text not null default 'uitgenodigd' check (status in ('uitgenodigd', 'lid', 'nee', 'weg')),
  door bigint references private.gebruikers(id),
  gewijzigd timestamptz not null default now(),
  primary key (gezin_id, gebruiker)
);
create table if not exists private.gezin_items (
  id bigint generated always as identity primary key,
  gezin_id bigint not null references private.gezinnen(id),
  titel text not null,
  soort text not null default 'afspraak' check (soort in ('brengen', 'halen', 'afspraak', 'taak')),
  start timestamptz not null,
  minuten integer not null default 30 check (minuten between 5 and 1440),
  locatie text not null default '',
  voor text not null default '',
  wie bigint references private.gebruikers(id),
  notitie text not null default '',
  door bigint not null references private.gebruikers(id),
  weg boolean not null default false,
  gewijzigd timestamptz not null default now()
);
create index if not exists gezin_items_gezin_start on private.gezin_items (gezin_id, start);
create index if not exists gezin_items_wie on private.gezin_items (wie, start);
create index if not exists gezin_leden_gebruiker on private.gezin_leden (gebruiker);

alter table private.gezinnen enable row level security;
alter table private.gezin_leden enable row level security;
alter table private.gezin_items enable row level security;

create or replace function private.gezin_lid(p_gebruiker bigint, p_gezin bigint)
returns boolean language sql stable security definer set search_path to '' as $$
  select exists (select 1 from private.gezin_leden l join private.gezinnen g on g.id = l.gezin_id
                 where l.gezin_id = p_gezin and l.gebruiker = p_gebruiker and l.status = 'lid' and not g.weg)
$$;

create or replace function private.gezin_item_json(i private.gezin_items)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('id', i.id, 'gezin_id', i.gezin_id, 'titel', i.titel, 'soort', i.soort, 'start', i.start,
    'minuten', i.minuten, 'locatie', i.locatie, 'voor', i.voor, 'wie', i.wie,
    'wie_naam', case when i.wie is null then null else private.weergave(i.wie) end, 'notitie', i.notitie,
    'door', i.door, 'door_naam', private.weergave(i.door), 'gewijzigd', i.gewijzigd)
$$;

create or replace function public.gezin_maken(p_naam text, p_wachtwoord text, p_gezin text, p_kinderen text[])
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_gezin bigint;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if trim(coalesce(p_gezin, '')) = '' then return jsonb_build_object('fout', 'Geef je gezinsagenda een naam.'); end if;
  if (select count(*) from private.gezin_leden where gebruiker = v_id and status = 'lid') >= 3 then
    return jsonb_build_object('fout', 'Je zit al in 3 gezinsagenda''s.');
  end if;
  insert into private.gezinnen (naam, eigenaar, kinderen)
  values (left(trim(p_gezin), 60), v_id, coalesce((select jsonb_agg(left(trim(k), 30)) from unnest(p_kinderen) k
                                                    where trim(k) <> ''), '[]'::jsonb))
  returning id into v_gezin;
  insert into private.gezin_leden (gezin_id, gebruiker, status, door) values (v_gezin, v_id, 'lid', v_id);
  return jsonb_build_object('ok', true, 'id', v_gezin);
end; $$;

create or replace function public.gezin_bijwerken(p_naam text, p_wachtwoord text, p_gezin bigint, p_titel text,
                                                  p_kinderen text[])
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if not private.gezin_lid(v_id, p_gezin) then return jsonb_build_object('fout', 'Geen toegang tot deze gezinsagenda.'); end if;
  update private.gezinnen set naam = coalesce(nullif(left(trim(coalesce(p_titel, '')), 60), ''), naam),
    kinderen = coalesce((select jsonb_agg(left(trim(k), 30)) from unnest(p_kinderen) k where trim(k) <> ''), '[]'::jsonb)
  where id = p_gezin;
  return jsonb_build_object('ok', true);
end; $$;

create or replace function public.gezin_uitnodigen(p_naam text, p_wachtwoord text, p_gezin bigint, p_gast text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_gast bigint; v_status text;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if not private.gezin_lid(v_id, p_gezin) then return jsonb_build_object('fout', 'Geen toegang tot deze gezinsagenda.'); end if;
  select id into v_gast from private.gebruikers
  where naam = lower(trim(coalesce(p_gast, ''))) and not verwijderd and not geblokkeerd;
  if v_gast is null then return jsonb_build_object('fout', 'Geen gebruiker met die naam.'); end if;
  if v_gast = v_id then return jsonb_build_object('fout', 'Dat ben je zelf.'); end if;
  if (select count(*) from private.gezin_leden where gezin_id = p_gezin and status in ('lid', 'uitgenodigd')) >= 12 then
    return jsonb_build_object('fout', 'Een gezinsagenda heeft hoogstens 12 leden.');
  end if;
  select status into v_status from private.gezin_leden where gezin_id = p_gezin and gebruiker = v_gast;
  if v_status = 'lid' then return jsonb_build_object('fout', 'Is al lid.'); end if;
  insert into private.gezin_leden (gezin_id, gebruiker, status, door) values (p_gezin, v_gast, 'uitgenodigd', v_id)
  on conflict (gezin_id, gebruiker) do update set status = 'uitgenodigd', door = v_id, gewijzigd = now();
  perform private.push_inplannen(v_gast, now(), 'uitnodiging', 'gezin:' || p_gezin,
    private.weergave(v_id) || ' nodigt je uit', 'Voor de gezinsagenda ' || (select naam from private.gezinnen where id = p_gezin));
  return jsonb_build_object('ok', true);
end; $$;

-- Uitnodiging aannemen of afslaan, of later de gezinsagenda verlaten.
create or replace function public.gezin_antwoorden(p_naam text, p_wachtwoord text, p_gezin bigint, p_antwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if p_antwoord = 'ja' and (select count(*) from private.gezin_leden where gebruiker = v_id and status = 'lid') >= 3 then
    return jsonb_build_object('fout', 'Je zit al in 3 gezinsagenda''s.');
  end if;
  update private.gezin_leden
  set status = case p_antwoord when 'ja' then 'lid' when 'nee' then 'nee' else 'weg' end, gewijzigd = now()
  where gezin_id = p_gezin and gebruiker = v_id and p_antwoord in ('ja', 'nee', 'verlaten')
    and case p_antwoord when 'verlaten' then status = 'lid' else status = 'uitgenodigd' end;
  if not found then return jsonb_build_object('fout', 'Dit kan niet (meer).'); end if;
  if p_antwoord = 'verlaten' then
    update private.gezin_items set wie = null, gewijzigd = now()
    where gezin_id = p_gezin and wie = v_id and start > now() and not weg;
  end if;
  return jsonb_build_object('ok', true);
end; $$;

create or replace function public.mijn_gezinnen(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object('gezinnen', coalesce((
    select jsonb_agg(jsonb_build_object('id', g.id, 'naam', g.naam, 'kinderen', g.kinderen, 'status', l.status,
      'door', private.weergave(l.door),
      'leden', case when l.status = 'lid' then coalesce((select jsonb_agg(jsonb_build_object('id', x.gebruiker,
          'naam', private.weergave(x.gebruiker), 'status', x.status, 'ik', x.gebruiker = v_id) order by x.gewijzigd)
        from private.gezin_leden x where x.gezin_id = g.id and x.status in ('lid', 'uitgenodigd')), '[]'::jsonb)
        else '[]'::jsonb end) order by g.id)
    from private.gezin_leden l join private.gezinnen g on g.id = l.gezin_id
    where l.gebruiker = v_id and l.status in ('lid', 'uitgenodigd') and not g.weg), '[]'::jsonb));
end; $$;

create or replace function public.gezin_agenda(p_naam text, p_wachtwoord text, p_gezin bigint, p_van timestamptz,
                                               p_tot timestamptz)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if not private.gezin_lid(v_id, p_gezin) then return jsonb_build_object('fout', 'Geen toegang tot deze gezinsagenda.'); end if;
  return jsonb_build_object('items', coalesce((select jsonb_agg(private.gezin_item_json(i) order by i.start)
    from private.gezin_items i where i.gezin_id = p_gezin and not i.weg and i.start >= p_van and i.start < p_tot),
    '[]'::jsonb));
end; $$;

-- Wat aan jou is toegewezen, uit al je gezinsagenda's (voor je eigen agenda).
create or replace function public.mijn_gezin_taken(p_naam text, p_wachtwoord text, p_van timestamptz, p_tot timestamptz)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object('items', coalesce((select jsonb_agg(private.gezin_item_json(i) || jsonb_build_object(
      'gezin', g.naam) order by i.start)
    from private.gezin_items i join private.gezinnen g on g.id = i.gezin_id
    where i.wie = v_id and not i.weg and i.start >= p_van and i.start < p_tot and private.gezin_lid(v_id, i.gezin_id)),
    '[]'::jsonb));
end; $$;

create or replace function public.gezin_item_opslaan(p_naam text, p_wachtwoord text, p_gezin bigint, p_id bigint,
                                                     p_titel text, p_soort text, p_start timestamptz, p_minuten integer,
                                                     p_locatie text, p_voor text, p_wie bigint, p_notitie text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); i private.gezin_items; v_oud bigint; v_wanneer text;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if not private.gezin_lid(v_id, p_gezin) then return jsonb_build_object('fout', 'Geen toegang tot deze gezinsagenda.'); end if;
  if p_wie is not null and not private.gezin_lid(p_wie, p_gezin) then
    return jsonb_build_object('fout', 'Die persoon zit (nog) niet in de gezinsagenda.');
  end if;
  if trim(coalesce(p_titel, '')) = '' and trim(coalesce(p_voor, '')) = '' then
    return jsonb_build_object('fout', 'Waar gaat het om?');
  end if;
  if coalesce(p_soort, '') not in ('brengen', 'halen', 'afspraak', 'taak') then
    return jsonb_build_object('fout', 'Kies wat het is.');
  end if;
  if p_id is null then
    if (select count(*) from private.gezin_items where door = v_id and gewijzigd > now() - interval '1 day') >= 200 then
      return jsonb_build_object('fout', 'Je hebt vandaag al heel veel toegevoegd.');
    end if;
    insert into private.gezin_items (gezin_id, titel, soort, start, minuten, locatie, voor, wie, notitie, door)
    values (p_gezin, left(trim(coalesce(p_titel, '')), 100), p_soort, p_start, least(1440, greatest(5, coalesce(p_minuten, 30))),
            left(coalesce(p_locatie, ''), 200), left(trim(coalesce(p_voor, '')), 60), p_wie, left(coalesce(p_notitie, ''), 500), v_id)
    returning * into i;
  else
    select wie into v_oud from private.gezin_items where id = p_id and gezin_id = p_gezin and not weg;
    update private.gezin_items set titel = left(trim(coalesce(p_titel, '')), 100), soort = p_soort, start = p_start,
      minuten = least(1440, greatest(5, coalesce(p_minuten, 30))), locatie = left(coalesce(p_locatie, ''), 200),
      voor = left(trim(coalesce(p_voor, '')), 60), wie = p_wie, notitie = left(coalesce(p_notitie, ''), 500),
      gewijzigd = now()
    where id = p_id and gezin_id = p_gezin and not weg
    returning * into i;
    if i.id is null then return jsonb_build_object('fout', 'Dit staat niet (meer) in de gezinsagenda.'); end if;
  end if;
  v_wanneer := to_char(i.start at time zone 'Europe/Amsterdam', 'DD-MM HH24:MI');
  if i.wie is not null and i.wie <> v_id and i.wie is distinct from v_oud then
    perform private.push_inplannen(i.wie, now(), 'uitnodiging', 'gezin-item:' || i.id,
      private.weergave(v_id) || ' rekent op je', initcap(i.soort) || ' ' || i.voor || ' ' || i.titel || ', ' || v_wanneer);
  elsif i.wie is null and p_id is null then
    perform private.push_inplannen(l.gebruiker, now(), 'uitnodiging', 'gezin-open:' || i.id,
      'Wie kan er?', initcap(i.soort) || ' ' || i.voor || ' ' || i.titel || ', ' || v_wanneer)
    from private.gezin_leden l where l.gezin_id = p_gezin and l.status = 'lid' and l.gebruiker <> v_id;
  end if;
  return jsonb_build_object('ok', true, 'item', private.gezin_item_json(i));
end; $$;

-- "Ik doe het": een open klus op je nemen. Of juist teruggeven (p_ik = false).
create or replace function public.gezin_item_oppakken(p_naam text, p_wachtwoord text, p_id bigint, p_ik boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); i private.gezin_items;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  update private.gezin_items set wie = case when p_ik then v_id else null end, gewijzigd = now()
  where id = p_id and not weg and private.gezin_lid(v_id, gezin_id)
    and case when p_ik then wie is null else wie = v_id end
  returning * into i;
  if i.id is null then return jsonb_build_object('fout', 'Iemand anders was je net voor.'); end if;
  if i.door <> v_id then
    perform private.push_inplannen(i.door, now(), 'reactie', 'gezin-oppakken:' || i.id || ':' || coalesce(i.wie, 0),
      case when p_ik then private.weergave(v_id) || ' doet het' else private.weergave(v_id) || ' kan toch niet' end,
      initcap(i.soort) || ' ' || i.voor || ' ' || i.titel);
  end if;
  return jsonb_build_object('ok', true, 'item', private.gezin_item_json(i));
end; $$;

create or replace function public.gezin_item_weg(p_naam text, p_wachtwoord text, p_id bigint)
returns boolean language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return false; end if;
  update private.gezin_items set weg = true, gewijzigd = now()
  where id = p_id and private.gezin_lid(v_id, gezin_id);
  return found;
end; $$;

revoke all on function private.gezin_lid(bigint, bigint) from public, anon, authenticated;
revoke all on function private.gezin_item_json(private.gezin_items) from public, anon, authenticated;
