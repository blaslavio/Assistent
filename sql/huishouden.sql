-- Huishouden: de gezinsagenda wordt breder. Een gezin, studentenhuis, samenwonen of vrienden, met deelnemers
-- (ook zonder account) en hulpmiddelen naar keuze: agenda, boodschappen, gedeelde kosten (wie krijgt nog wat),
-- klussenrooster (om de beurt), samen sparen (een pot) en een gezamenlijk budget per maand.
-- Alleen leden die meededen zien iets. Weghalen zet weg = true.

alter table private.gezinnen add column if not exists vorm text not null default 'gezin';
alter table private.gezinnen add column if not exists tools jsonb not null default '["agenda"]'::jsonb;
alter table private.gezinnen add column if not exists budget jsonb not null default '{}'::jsonb;

create table if not exists private.gezin_lijst (
  id bigint generated always as identity primary key,
  gezin_id bigint not null references private.gezinnen(id),
  tekst text not null,
  door bigint not null references private.gebruikers(id),
  klaar boolean not null default false,
  klaar_door bigint references private.gebruikers(id),
  weg boolean not null default false,
  gewijzigd timestamptz not null default now()
);
create table if not exists private.gezin_kosten (
  id bigint generated always as identity primary key,
  gezin_id bigint not null references private.gezinnen(id),
  betaald_door bigint not null references private.gebruikers(id),
  bedrag numeric(10, 2) not null check (bedrag between 0.01 and 100000),
  omschrijving text not null,
  categorie text not null default '',
  datum date not null default current_date,
  verdeeld bigint[] not null default '{}',  -- leeg = iedereen die lid is
  terugbetaling boolean not null default false,
  door bigint not null references private.gebruikers(id),
  weg boolean not null default false,
  aangemaakt timestamptz not null default now()
);
create table if not exists private.gezin_klussen (
  id bigint generated always as identity primary key,
  gezin_id bigint not null references private.gezinnen(id),
  titel text not null,
  elke text not null default 'week' check (elke in ('dag', 'week')),
  volgorde bigint[] not null,
  begin date not null default current_date,
  weg boolean not null default false,
  aangemaakt timestamptz not null default now()
);
create table if not exists private.gezin_klus_klaar (
  klus bigint not null references private.gezin_klussen(id),
  periode date not null,
  door bigint not null references private.gebruikers(id),
  klaar boolean not null default true,
  tijd timestamptz not null default now(),
  primary key (klus, periode)
);
create index if not exists gezin_lijst_gezin on private.gezin_lijst (gezin_id) where not weg;
create index if not exists gezin_kosten_gezin on private.gezin_kosten (gezin_id, datum desc) where not weg;
alter table private.gezin_lijst enable row level security;
alter table private.gezin_kosten enable row level security;
alter table private.gezin_klussen enable row level security;
alter table private.gezin_klus_klaar enable row level security;

create or replace function private.huishouden_tools(p_tools text[])
returns jsonb language sql immutable set search_path to '' as $$
  select coalesce(jsonb_agg(t order by t), '["agenda"]'::jsonb)
  from (select distinct t from unnest(coalesce(p_tools, '{}')) t
        where t in ('agenda', 'boodschappen', 'kosten', 'klussen', 'sparen', 'budget')) x
$$;

create or replace function public.huishouden_maken(p_naam text, p_wachtwoord text, p_titel text, p_vorm text,
                                                   p_deelnemers text[], p_tools text[])
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_gezin bigint;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if trim(coalesce(p_titel, '')) = '' then return jsonb_build_object('fout', 'Geef het een naam.'); end if;
  if coalesce(p_vorm, '') not in ('gezin', 'studentenhuis', 'samenwonen', 'vrienden', 'anders') then
    return jsonb_build_object('fout', 'Kies wat voor huishouden het is.');
  end if;
  if (select count(*) from private.gezin_leden where gebruiker = v_id and status = 'lid') >= 5 then
    return jsonb_build_object('fout', 'Je zit al in 5 huishoudens of groepen.');
  end if;
  insert into private.gezinnen (naam, eigenaar, kinderen, vorm, tools)
  values (left(trim(p_titel), 60), v_id, coalesce((select jsonb_agg(left(trim(k), 30)) from unnest(p_deelnemers) k
                                                   where trim(k) <> ''), '[]'::jsonb),
          p_vorm, private.huishouden_tools(p_tools))
  returning id into v_gezin;
  insert into private.gezin_leden (gezin_id, gebruiker, status, door) values (v_gezin, v_id, 'lid', v_id);
  return jsonb_build_object('ok', true, 'id', v_gezin);
end; $$;

create or replace function public.huishouden_instellen(p_naam text, p_wachtwoord text, p_gezin bigint, p_titel text,
                                                       p_vorm text, p_deelnemers text[], p_tools text[], p_budget jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if not private.gezin_lid(v_id, p_gezin) then return jsonb_build_object('fout', 'Geen toegang.'); end if;
  update private.gezinnen set naam = coalesce(nullif(left(trim(coalesce(p_titel, '')), 60), ''), naam),
    vorm = case when p_vorm in ('gezin', 'studentenhuis', 'samenwonen', 'vrienden', 'anders') then p_vorm else vorm end,
    kinderen = coalesce((select jsonb_agg(left(trim(k), 30)) from unnest(p_deelnemers) k where trim(k) <> ''), '[]'::jsonb),
    tools = private.huishouden_tools(p_tools),
    budget = coalesce((select jsonb_object_agg(left(k, 40), round(greatest(0, least(100000, v::numeric)), 2))
                       from jsonb_each_text(coalesce(p_budget, '{}'::jsonb)) e(k, v)
                       where v ~ '^[0-9]+([.][0-9]+)?$'), '{}'::jsonb)
  where id = p_gezin;
  return jsonb_build_object('ok', true);
end; $$;

-- mijn_gezinnen, nu met vorm, hulpmiddelen en budget.
create or replace function public.mijn_gezinnen(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object('gezinnen', coalesce((
    select jsonb_agg(jsonb_build_object('id', g.id, 'naam', g.naam, 'kinderen', g.kinderen, 'status', l.status,
      'vorm', g.vorm, 'tools', g.tools, 'budget', g.budget,
      'door', private.weergave(l.door),
      'leden', case when l.status = 'lid' then coalesce((select jsonb_agg(jsonb_build_object('id', x.gebruiker,
          'naam', private.weergave(x.gebruiker), 'status', x.status, 'ik', x.gebruiker = v_id) order by x.gewijzigd)
        from private.gezin_leden x where x.gezin_id = g.id and x.status in ('lid', 'uitgenodigd')), '[]'::jsonb)
        else '[]'::jsonb end) order by g.id)
    from private.gezin_leden l join private.gezinnen g on g.id = l.gezin_id
    where l.gebruiker = v_id and l.status in ('lid', 'uitgenodigd') and not g.weg), '[]'::jsonb));
end; $$;

-- --- Boodschappen ---------------------------------------------------------------------------------------------

create or replace function public.huis_lijst(p_naam text, p_wachtwoord text, p_gezin bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if not private.gezin_lid(v_id, p_gezin) then return jsonb_build_object('fout', 'Geen toegang.'); end if;
  return jsonb_build_object('items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'tekst', i.tekst,
      'klaar', i.klaar, 'door', private.weergave(i.door)) order by i.klaar, i.gewijzigd desc)
    from private.gezin_lijst i where i.gezin_id = p_gezin and not i.weg
      and (not i.klaar or i.gewijzigd > now() - interval '2 days')), '[]'::jsonb));
end; $$;

create or replace function public.huis_lijst_bijwerken(p_naam text, p_wachtwoord text, p_gezin bigint, p_id bigint,
                                                       p_tekst text, p_actie text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if not private.gezin_lid(v_id, p_gezin) then return jsonb_build_object('fout', 'Geen toegang.'); end if;
  if p_actie = 'erbij' then
    if trim(coalesce(p_tekst, '')) = '' then return jsonb_build_object('fout', 'Wat moet er gehaald worden?'); end if;
    if (select count(*) from private.gezin_lijst where gezin_id = p_gezin and not weg and not klaar) >= 200 then
      return jsonb_build_object('fout', 'De lijst is vol.');
    end if;
    insert into private.gezin_lijst (gezin_id, tekst, door) values (p_gezin, left(trim(p_tekst), 100), v_id);
  elsif p_actie in ('klaar', 'open') then
    update private.gezin_lijst set klaar = p_actie = 'klaar', klaar_door = case when p_actie = 'klaar' then v_id end,
      gewijzigd = now() where id = p_id and gezin_id = p_gezin;
  elsif p_actie = 'weg' then
    update private.gezin_lijst set weg = true, gewijzigd = now() where id = p_id and gezin_id = p_gezin;
  elsif p_actie = 'klaar_weg' then
    update private.gezin_lijst set weg = true, gewijzigd = now() where gezin_id = p_gezin and klaar and not weg;
  else
    return jsonb_build_object('fout', 'Onbekende actie.');
  end if;
  return jsonb_build_object('ok', true);
end; $$;

-- --- Gedeelde kosten ------------------------------------------------------------------------------------------

create or replace function public.huis_kosten(p_naam text, p_wachtwoord text, p_gezin bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if not private.gezin_lid(v_id, p_gezin) then return jsonb_build_object('fout', 'Geen toegang.'); end if;
  return jsonb_build_object(
    'kosten', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'bedrag', k.bedrag, 'omschrijving', k.omschrijving,
        'categorie', k.categorie, 'datum', k.datum, 'betaald_door', k.betaald_door,
        'betaald_naam', private.weergave(k.betaald_door), 'verdeeld', k.verdeeld, 'terugbetaling', k.terugbetaling,
        'van_mij', k.door = v_id) order by k.datum desc, k.id desc)
      from (select * from private.gezin_kosten k where k.gezin_id = p_gezin and not k.weg
            order by k.datum desc, k.id desc limit 150) k), '[]'::jsonb),
    -- Saldo per lid: betaald min eigen deel. Positief = krijgt nog geld.
    'saldo', coalesce((select jsonb_agg(jsonb_build_object('id', s.wie, 'naam', private.weergave(s.wie),
        'saldo', round(s.saldo, 2)) order by s.saldo desc)
      from (select l.gebruiker as wie,
              coalesce((select sum(k.bedrag) from private.gezin_kosten k where k.gezin_id = p_gezin and not k.weg
                        and k.betaald_door = l.gebruiker), 0)
              - coalesce((select sum(k.bedrag / greatest(1, cardinality(case when cardinality(k.verdeeld) = 0
                          then (select array_agg(x.gebruiker) from private.gezin_leden x
                                where x.gezin_id = p_gezin and x.status = 'lid') else k.verdeeld end)))
                        from private.gezin_kosten k where k.gezin_id = p_gezin and not k.weg
                          and (l.gebruiker = any (k.verdeeld) or (cardinality(k.verdeeld) = 0 and l.status = 'lid'))), 0)
              as saldo
            from private.gezin_leden l where l.gezin_id = p_gezin and l.status in ('lid', 'weg')) s
      where s.wie in (select gebruiker from private.gezin_leden where gezin_id = p_gezin and status = 'lid')
         or abs(s.saldo) >= 0.01), '[]'::jsonb),
    'deze_maand', coalesce((select jsonb_object_agg(c, t) from (select coalesce(nullif(k.categorie, ''), 'Overig') c,
        sum(k.bedrag) t from private.gezin_kosten k where k.gezin_id = p_gezin and not k.weg and not k.terugbetaling
          and date_trunc('month', k.datum) = date_trunc('month', current_date) group by 1) m), '{}'::jsonb));
end; $$;

create or replace function public.huis_kosten_toevoegen(p_naam text, p_wachtwoord text, p_gezin bigint,
  p_bedrag numeric, p_omschrijving text, p_categorie text, p_datum date, p_betaald_door bigint, p_verdeeld bigint[],
  p_terugbetaling boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_wie bigint := coalesce(p_betaald_door, v_id);
  v_kosten bigint;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if not private.gezin_lid(v_id, p_gezin) then return jsonb_build_object('fout', 'Geen toegang.'); end if;
  if not private.gezin_lid(v_wie, p_gezin)
     or exists (select 1 from unnest(coalesce(p_verdeeld, '{}')) x where not private.gezin_lid(x, p_gezin)) then
    return jsonb_build_object('fout', 'Kies leden van dit huishouden.');
  end if;
  if coalesce(p_bedrag, 0) <= 0 or p_bedrag > 100000 then return jsonb_build_object('fout', 'Vul een bedrag in.'); end if;
  if trim(coalesce(p_omschrijving, '')) = '' then return jsonb_build_object('fout', 'Waarvoor was het?'); end if;
  if (select count(*) from private.gezin_kosten where door = v_id and aangemaakt > now() - interval '1 day') >= 200 then
    return jsonb_build_object('fout', 'Je hebt vandaag al heel veel toegevoegd.');
  end if;
  insert into private.gezin_kosten (gezin_id, betaald_door, bedrag, omschrijving, categorie, datum, verdeeld,
                                    terugbetaling, door)
  values (p_gezin, v_wie, round(p_bedrag, 2), left(trim(p_omschrijving), 100), left(coalesce(p_categorie, ''), 40),
          coalesce(p_datum, current_date), coalesce((select array_agg(distinct x) from unnest(p_verdeeld) x), '{}'),
          coalesce(p_terugbetaling, false), v_id)
  returning id into v_kosten;
  return jsonb_build_object('ok', true, 'id', v_kosten);
end; $$;

create or replace function public.huis_kosten_weg(p_naam text, p_wachtwoord text, p_id bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  update private.gezin_kosten set weg = true
  where id = p_id and private.gezin_lid(v_id, gezin_id) and (door = v_id or betaald_door = v_id);
  if not found then return jsonb_build_object('fout', 'Alleen wie het invoerde of betaalde kan dit weghalen.'); end if;
  return jsonb_build_object('ok', true);
end; $$;

-- --- Klussenrooster (om de beurt) -----------------------------------------------------------------------------

create or replace function public.huis_klussen(p_naam text, p_wachtwoord text, p_gezin bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if not private.gezin_lid(v_id, p_gezin) then return jsonb_build_object('fout', 'Geen toegang.'); end if;
  return jsonb_build_object('klussen', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'titel', k.titel,
      'elke', k.elke, 'periode', x.periode,
      'wie', k.volgorde[1 + (x.n % cardinality(k.volgorde))],
      'wie_naam', private.weergave(k.volgorde[1 + (x.n % cardinality(k.volgorde))]),
      'daarna', private.weergave(k.volgorde[1 + ((x.n + 1) % cardinality(k.volgorde))]),
      'klaar', exists (select 1 from private.gezin_klus_klaar d where d.klus = k.id and d.periode = x.periode and d.klaar))
      order by k.id)
    from private.gezin_klussen k
    cross join lateral (select case k.elke when 'dag' then current_date
                                 else date_trunc('week', current_date)::date end as periode,
                               greatest(0, case k.elke when 'dag' then current_date - k.begin
                                 else (date_trunc('week', current_date)::date - date_trunc('week', k.begin)::date) / 7 end) as n) x
    where k.gezin_id = p_gezin and not k.weg and cardinality(k.volgorde) > 0), '[]'::jsonb));
end; $$;

create or replace function public.huis_klus_bijwerken(p_naam text, p_wachtwoord text, p_gezin bigint, p_id bigint,
                                                      p_titel text, p_elke text, p_volgorde bigint[], p_actie text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); k private.gezin_klussen; v_periode date;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if not private.gezin_lid(v_id, p_gezin) then return jsonb_build_object('fout', 'Geen toegang.'); end if;
  if p_actie = 'maken' then
    if trim(coalesce(p_titel, '')) = '' then return jsonb_build_object('fout', 'Welke klus?'); end if;
    if cardinality(coalesce(p_volgorde, '{}')) = 0
       or exists (select 1 from unnest(p_volgorde) x where not private.gezin_lid(x, p_gezin)) then
      return jsonb_build_object('fout', 'Kies wie meedoen.');
    end if;
    if (select count(*) from private.gezin_klussen where gezin_id = p_gezin and not weg) >= 40 then
      return jsonb_build_object('fout', 'Er staan al 40 klussen op het rooster.');
    end if;
    insert into private.gezin_klussen (gezin_id, titel, elke, volgorde)
    values (p_gezin, left(trim(p_titel), 60), case when p_elke = 'dag' then 'dag' else 'week' end, p_volgorde);
    return jsonb_build_object('ok', true);
  end if;
  select * into k from private.gezin_klussen where id = p_id and gezin_id = p_gezin and not weg;
  if k.id is null then return jsonb_build_object('fout', 'Deze klus staat niet (meer) op het rooster.'); end if;
  v_periode := case k.elke when 'dag' then current_date else date_trunc('week', current_date)::date end;
  if p_actie = 'klaar' then
    insert into private.gezin_klus_klaar (klus, periode, door) values (k.id, v_periode, v_id)
    on conflict (klus, periode) do update set klaar = true, door = v_id, tijd = now();
  elsif p_actie = 'open' then
    update private.gezin_klus_klaar set klaar = false, door = v_id, tijd = now() where klus = k.id and periode = v_periode;
  elsif p_actie = 'weg' then
    update private.gezin_klussen set weg = true where id = k.id;
  else
    return jsonb_build_object('fout', 'Onbekende actie.');
  end if;
  return jsonb_build_object('ok', true);
end; $$;

revoke all on function private.huishouden_tools(text[]) from public, anon, authenticated;
