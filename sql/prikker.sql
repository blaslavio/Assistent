-- Samen een datum kiezen (zoals Datumprikker). De maker stelt een paar momenten voor; genodigden in de app en
-- iedereen met de link stemt ja, misschien of nee. De maker kiest daarna het moment; dat komt in de agenda.
-- Wie de link heeft, ziet de namen en stemmen van de andere deelnemers (de link is de uitnodiging).

create table if not exists private.peilingen (
  id bigint generated always as identity primary key,
  eigenaar bigint not null references private.gebruikers(id),
  titel text not null,
  plaats text not null default '',
  notitie text not null default '',
  minuten integer not null default 60 check (minuten between 15 and 1440),
  code_hash text not null unique,
  open boolean not null default true,
  gekozen timestamptz,
  weg boolean not null default false,
  aangemaakt timestamptz not null default now()
);
create table if not exists private.peiling_opties (
  id bigint generated always as identity primary key,
  peiling_id bigint not null references private.peilingen(id),
  start timestamptz not null,
  unique (peiling_id, start)
);
create table if not exists private.peiling_genodigden (
  peiling_id bigint not null references private.peilingen(id),
  gebruiker bigint not null references private.gebruikers(id),
  primary key (peiling_id, gebruiker)
);
create table if not exists private.peiling_stemmen (
  id bigint generated always as identity primary key,
  peiling_id bigint not null references private.peilingen(id),
  gebruiker bigint references private.gebruikers(id),
  naam text not null,
  sleutel_hash text not null,
  stemmen jsonb not null default '{}'::jsonb,
  gewijzigd timestamptz not null default now(),
  unique (peiling_id, sleutel_hash)
);
create unique index if not exists peiling_stemmen_naam on private.peiling_stemmen (peiling_id, lower(naam));
create index if not exists peiling_genodigden_gebruiker on private.peiling_genodigden (gebruiker);

alter table private.peilingen enable row level security;
alter table private.peiling_opties enable row level security;
alter table private.peiling_genodigden enable row level security;
alter table private.peiling_stemmen enable row level security;

create or replace function private.peiling_json(p private.peilingen, p_ik bigint)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('id', p.id, 'titel', p.titel, 'plaats', p.plaats, 'notitie', p.notitie,
    'minuten', p.minuten, 'open', p.open, 'gekozen', p.gekozen, 'maker', private.weergave(p.eigenaar),
    'van_mij', p.eigenaar = p_ik, 'aangemaakt', p.aangemaakt,
    'opties', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'start', o.start,
        'ja', (select count(*) from private.peiling_stemmen s where s.peiling_id = p.id and s.stemmen ->> o.id::text = 'ja'),
        'misschien', (select count(*) from private.peiling_stemmen s where s.peiling_id = p.id
                      and s.stemmen ->> o.id::text = 'misschien')) order by o.start)
      from private.peiling_opties o where o.peiling_id = p.id), '[]'::jsonb),
    'stemmen', coalesce((select jsonb_agg(jsonb_build_object('naam', s.naam, 'stemmen', s.stemmen,
        'ik', p_ik is not null and s.gebruiker = p_ik) order by s.gewijzigd)
      from private.peiling_stemmen s where s.peiling_id = p.id), '[]'::jsonb),
    'genodigden', coalesce((select jsonb_agg(private.weergave(g.gebruiker)) from private.peiling_genodigden g
      where g.peiling_id = p.id), '[]'::jsonb))
$$;

create or replace function public.peiling_maken(p_naam text, p_wachtwoord text, p_titel text, p_plaats text,
                                                p_notitie text, p_minuten integer, p_opties text[], p_genodigden text[])
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_code text := encode(extensions.gen_random_bytes(12), 'hex');
  v_peiling bigint; v_gast bigint; v_naam text; v_niet text[] := '{}';
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if trim(coalesce(p_titel, '')) = '' then return jsonb_build_object('fout', 'Geef je voorstel een naam.'); end if;
  if coalesce(array_length(p_opties, 1), 0) not between 2 and 12 then
    return jsonb_build_object('fout', 'Kies 2 tot 12 momenten.');
  end if;
  if (select count(*) from private.peilingen where eigenaar = v_id and aangemaakt > now() - interval '1 day') >= 20 then
    return jsonb_build_object('fout', 'Je hebt vandaag al veel stemrondes gemaakt.');
  end if;
  insert into private.peilingen (eigenaar, titel, plaats, notitie, minuten, code_hash)
  values (v_id, left(trim(p_titel), 100), left(coalesce(p_plaats, ''), 200), left(coalesce(p_notitie, ''), 500),
          least(1440, greatest(15, coalesce(p_minuten, 60))), encode(extensions.digest(v_code, 'sha256'), 'hex'))
  returning id into v_peiling;
  insert into private.peiling_opties (peiling_id, start)
  select v_peiling, x::timestamptz from unnest(p_opties) x
  where x::timestamptz > now() on conflict do nothing;
  foreach v_naam in array coalesce(p_genodigden, '{}') loop
    select id into v_gast from private.gebruikers
    where lower(naam) = lower(trim(v_naam)) and not verwijderd and not geblokkeerd and id <> v_id;
    if v_gast is null then
      v_niet := v_niet || v_naam;
    else
      insert into private.peiling_genodigden values (v_peiling, v_gast) on conflict do nothing;
      perform private.push_inplannen(v_gast, now(), 'uitnodiging', 'peiling:' || v_peiling,
        private.weergave(v_id) || ' vraagt wanneer je kunt', left(trim(p_titel), 100));
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'id', v_peiling, 'code', v_code, 'niet_gevonden', to_jsonb(v_niet));
end; $$;

create or replace function public.mijn_peilingen(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object('peilingen', coalesce((select jsonb_agg(private.peiling_json(p, v_id) order by p.aangemaakt desc)
    from private.peilingen p where not p.weg and p.aangemaakt > now() - interval '90 days'
      and (p.eigenaar = v_id or exists (select 1 from private.peiling_genodigden g where g.peiling_id = p.id and g.gebruiker = v_id))
      and (p.open or p.gekozen > now() - interval '1 day')), '[]'::jsonb));
end; $$;

-- Stemmen als app-gebruiker (genodigde of maker).
create or replace function public.peiling_stem_ik(p_naam text, p_wachtwoord text, p_id bigint, p_stemmen jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); p private.peilingen;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into p from private.peilingen where id = p_id and not weg;
  if p.id is null or not (p.eigenaar = v_id or exists (select 1 from private.peiling_genodigden g
                                                       where g.peiling_id = p.id and g.gebruiker = v_id)) then
    return jsonb_build_object('fout', 'Stemronde niet gevonden.');
  end if;
  if not p.open then return jsonb_build_object('fout', 'De stemronde is gesloten.'); end if;
  insert into private.peiling_stemmen (peiling_id, gebruiker, naam, sleutel_hash, stemmen)
  values (p.id, v_id, private.weergave(v_id), 'gebruiker:' || v_id, private.peiling_opschonen(p.id, p_stemmen))
  on conflict (peiling_id, sleutel_hash) do update set stemmen = excluded.stemmen, gewijzigd = now();
  return jsonb_build_object('ok', true);
exception when unique_violation then
  return jsonb_build_object('fout', 'Er stemt al iemand met jouw naam. Vraag de maker om het na te kijken.');
end; $$;

-- Alleen geldige opties en antwoorden bewaren.
create or replace function private.peiling_opschonen(p_peiling bigint, p_stemmen jsonb)
returns jsonb language sql stable security definer set search_path to '' as $$
  select coalesce(jsonb_object_agg(o.id::text, p_stemmen ->> o.id::text), '{}'::jsonb)
  from private.peiling_opties o
  where o.peiling_id = p_peiling and jsonb_typeof(p_stemmen) = 'object'
    and p_stemmen ->> o.id::text in ('ja', 'misschien', 'nee')
$$;

-- Via de link, zonder account.
create or replace function public.peiling_bekijken(p_code text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare p private.peilingen;
begin
  select * into p from private.peilingen
  where code_hash = encode(extensions.digest(coalesce(p_code, ''), 'sha256'), 'hex') and not weg;
  if p.id is null then return jsonb_build_object('fout', 'Deze link werkt niet (meer).'); end if;
  return private.peiling_json(p, null) - 'id' - 'van_mij' - 'genodigden';
end; $$;

create or replace function public.peiling_stemmen(p_code text, p_kiezer text, p_sleutel text, p_stemmen jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare p private.peilingen; v_naam text := left(trim(coalesce(p_kiezer, '')), 40); v_nieuw boolean;
  v_sleutel text := encode(extensions.digest('anoniem:' || coalesce(p_sleutel, ''), 'sha256'), 'hex');
begin
  select * into p from private.peilingen
  where code_hash = encode(extensions.digest(coalesce(p_code, ''), 'sha256'), 'hex') and not weg;
  if p.id is null then return jsonb_build_object('fout', 'Deze link werkt niet (meer).'); end if;
  if not p.open then return jsonb_build_object('fout', 'De stemronde is gesloten.'); end if;
  if v_naam = '' then return jsonb_build_object('fout', 'Vul je naam in.'); end if;
  if length(coalesce(p_sleutel, '')) < 16 then return jsonb_build_object('fout', 'Ongeldige sleutel.'); end if;
  if (select count(*) from private.peiling_stemmen where peiling_id = p.id) >= 100 then
    return jsonb_build_object('fout', 'Deze stemronde zit vol.');
  end if;
  insert into private.peiling_stemmen (peiling_id, naam, sleutel_hash, stemmen)
  values (p.id, v_naam, v_sleutel, private.peiling_opschonen(p.id, p_stemmen))
  on conflict (peiling_id, sleutel_hash) do update set naam = excluded.naam, stemmen = excluded.stemmen, gewijzigd = now()
  returning (xmax = 0) into v_nieuw;
  if v_nieuw then
    perform private.push_inplannen(p.eigenaar, now(), 'uitnodiging', 'peiling-stem:' || p.id || ':' || md5(v_sleutel),
      v_naam || ' heeft gestemd', p.titel);
  end if;
  return jsonb_build_object('ok', true);
exception when unique_violation then
  return jsonb_build_object('fout', 'Deze naam is al gebruikt. Kies een andere naam.');
end; $$;

-- De maker kiest het moment (of sluit zonder keuze). Genodigden krijgen een seintje.
create or replace function public.peiling_kiezen(p_naam text, p_wachtwoord text, p_id bigint, p_optie bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); p private.peilingen; v_start timestamptz;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into p from private.peilingen where id = p_id and eigenaar = v_id and not weg;
  if p.id is null then return jsonb_build_object('fout', 'Stemronde niet gevonden.'); end if;
  if p_optie is not null then
    select start into v_start from private.peiling_opties where id = p_optie and peiling_id = p.id;
    if v_start is null then return jsonb_build_object('fout', 'Kies een van de momenten.'); end if;
  end if;
  update private.peilingen set open = false, gekozen = v_start where id = p.id;
  if v_start is not null then
    perform private.push_inplannen(g.gebruiker, now(), 'uitnodiging', 'peiling-gekozen:' || p.id,
      p.titel || ': het wordt ' || to_char(v_start at time zone 'Europe/Amsterdam', 'DD-MM HH24:MI'), p.plaats)
    from private.peiling_genodigden g where g.peiling_id = p.id;
  end if;
  return jsonb_build_object('ok', true, 'start', v_start, 'minuten', p.minuten, 'titel', p.titel, 'plaats', p.plaats,
    'genodigden', coalesce((select jsonb_agg(u.naam) from private.peiling_genodigden g
      join private.gebruikers u on u.id = g.gebruiker
      left join private.peiling_stemmen s on s.peiling_id = p.id and s.gebruiker = g.gebruiker
      where g.peiling_id = p.id and coalesce(s.stemmen ->> p_optie::text, '') <> 'nee' and u.naam is not null), '[]'::jsonb));
end; $$;

create or replace function public.peiling_weg(p_naam text, p_wachtwoord text, p_id bigint)
returns boolean language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return false; end if;
  update private.peilingen set weg = true, open = false where id = p_id and eigenaar = v_id;
  return found;
end; $$;

revoke all on function private.peiling_json(private.peilingen, bigint) from public, anon, authenticated;
revoke all on function private.peiling_opschonen(bigint, jsonb) from public, anon, authenticated;
