-- Community's in de chat: een groep mensen met meerdere kanalen (zoals #algemeen en #mededelingen), rollen
-- (eigenaar, beheerder, lid) en een uitnodigingscode. Elk kanaal is een groepsgesprek (chat_gesprekken met
-- community ingevuld), dus de berichten zijn net zo end-to-end versleuteld als in een gewone groep.
-- Reacties met emoji, antwoorden, peilingen en evenementen zitten versleuteld in de berichten zelf; de server
-- weet alleen welk bericht is vastgezet en wie er bij een vermelding een melding krijgt.

create table if not exists private.chat_communities (
  id bigint generated always as identity primary key,
  naam text not null,
  omschrijving text not null default '',
  maker bigint not null references private.gebruikers(id),
  code text not null,
  code_aan boolean not null default true,
  aangemaakt timestamptz not null default now(),
  weg boolean not null default false
);
create unique index if not exists chat_communities_code on private.chat_communities (code);
create table if not exists private.chat_community_leden (
  community bigint not null references private.chat_communities(id),
  gebruiker bigint not null references private.gebruikers(id),
  rol text not null default 'lid' check (rol in ('eigenaar', 'beheerder', 'lid')),
  status text not null default 'lid' check (status in ('lid', 'uitgenodigd', 'weg', 'geweerd')),
  door bigint references private.gebruikers(id),
  aangemaakt timestamptz not null default now(),
  primary key (community, gebruiker)
);
create index if not exists chat_community_leden_gebruiker on private.chat_community_leden (gebruiker);
create table if not exists private.chat_code_pogingen (
  gebruiker bigint not null references private.gebruikers(id),
  tijd timestamptz not null default now()
);
create index if not exists chat_code_pogingen_gebruiker on private.chat_code_pogingen (gebruiker, tijd);

alter table private.chat_gesprekken add column if not exists community bigint references private.chat_communities(id);
alter table private.chat_gesprekken add column if not exists alleen_beheer boolean not null default false;
alter table private.chat_gesprekken add column if not exists positie integer not null default 0;
alter table private.chat_gesprekken add column if not exists weg boolean not null default false;
alter table private.chat_berichten add column if not exists vast boolean not null default false;
create index if not exists chat_gesprekken_community on private.chat_gesprekken (community) where community is not null;

alter table private.chat_communities enable row level security;
alter table private.chat_community_leden enable row level security;
alter table private.chat_code_pogingen enable row level security;

create or replace function private.chat_community_rol(p_gebruiker bigint, p_community bigint)
returns text language sql stable security definer set search_path to '' as $$
  select rol from private.chat_community_leden where community = p_community and gebruiker = p_gebruiker and status = 'lid'
$$;

create or replace function private.chat_mag_beheren(p_gebruiker bigint, p_gesprek bigint)
returns boolean language sql stable security definer set search_path to '' as $$
  select case when g.community is not null then private.chat_community_rol(p_gebruiker, g.community) in ('eigenaar', 'beheerder')
              when g.soort = 'groep' then exists (select 1 from private.chat_leden where gesprek = g.id and gebruiker = p_gebruiker
                                                  and status = 'lid' and beheerder)
              else private.chat_lid(p_gebruiker, g.id) = 'lid' end
  from private.chat_gesprekken g where g.id = p_gesprek
$$;

create or replace function private.chat_community_lid_worden(p_community bigint, p_gebruiker bigint, p_rol text)
returns void language plpgsql security definer set search_path to '' as $$
begin
  insert into private.chat_community_leden (community, gebruiker, rol, status) values (p_community, p_gebruiker, p_rol, 'lid')
  on conflict (community, gebruiker) do update set status = 'lid',
    rol = case when private.chat_community_leden.rol = 'eigenaar' then 'eigenaar' else p_rol end;
  insert into private.chat_leden (gesprek, gebruiker, status, beheerder, gelezen_tot)
  select g.id, p_gebruiker, 'lid', p_rol in ('eigenaar', 'beheerder'),
         coalesce((select max(b.id) from private.chat_berichten b where b.gesprek = g.id), 0)
  from private.chat_gesprekken g where g.community = p_community and not g.weg
  on conflict (gesprek, gebruiker) do update set status = 'lid', beheerder = excluded.beheerder, gewijzigd = now();
end; $$;

create or replace function private.chat_community_json(c private.chat_communities, p_ik bigint)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('id', c.id, 'naam', c.naam, 'omschrijving', c.omschrijving, 'rol', m.rol, 'status', m.status,
    'door', private.weergave(m.door),
    'leden', (select count(*) from private.chat_community_leden x where x.community = c.id and x.status = 'lid'),
    'kanalen', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'naam', g.naam, 'alleen_beheer', g.alleen_beheer,
        'laatst', g.laatst, 'stil', l.stil,
        'ongelezen', (select count(*) from private.chat_berichten b where b.gesprek = g.id and b.id > l.gelezen_tot
                      and b.afzender <> p_ik and not b.weg))
        order by g.positie, g.id)
      from private.chat_gesprekken g join private.chat_leden l on l.gesprek = g.id and l.gebruiker = p_ik and l.status = 'lid'
      where g.community = c.id and not g.weg), '[]'::jsonb))
  from private.chat_community_leden m where m.community = c.id and m.gebruiker = p_ik
$$;

create or replace function private.chat_gesprek_json(g private.chat_gesprekken, p_ik bigint)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('id', g.id, 'soort', g.soort, 'naam', g.naam, 'verdwijnen', g.verdwijnen,
    'laatst', g.laatst, 'status', l.status, 'beheerder', l.beheerder, 'stil', l.stil,
    'community', g.community, 'alleen_beheer', g.alleen_beheer,
    'community_naam', (select c.naam from private.chat_communities c where c.id = g.community),
    'ongelezen', (select count(*) from private.chat_berichten b where b.gesprek = g.id and b.id > l.gelezen_tot
                  and b.afzender <> p_ik and not b.weg),
    'laatste_id', (select max(b.id) from private.chat_berichten b where b.gesprek = g.id),
    'vast', coalesce((select jsonb_agg(b.id order by b.id) from private.chat_berichten b
                      where b.gesprek = g.id and b.vast and not b.weg), '[]'::jsonb),
    'leden', coalesce((select jsonb_agg(jsonb_build_object('id', x.gebruiker, 'naam', private.weergave(x.gebruiker),
        'gebruikersnaam', u.naam, 'status', x.status, 'beheerder', x.beheerder, 'gelezen_tot', x.gelezen_tot,
        'contact', private.chat_is_contact(p_ik, x.gebruiker))
        order by x.gebruiker)
      from private.chat_leden x join private.gebruikers u on u.id = x.gebruiker
      where x.gesprek = g.id and x.status <> 'weg'), '[]'::jsonb))
  from private.chat_leden l where l.gesprek = g.id and l.gebruiker = p_ik
$$;

create or replace function public.chat_gesprekken(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object('gesprekken', coalesce((select jsonb_agg(private.chat_gesprek_json(g, v_id) order by g.laatst desc)
    from private.chat_gesprekken g join private.chat_leden l on l.gesprek = g.id
    where l.gebruiker = v_id and l.status in ('lid', 'verzoek') and g.community is null), '[]'::jsonb),
    'communities', coalesce((select jsonb_agg(private.chat_community_json(c, v_id) order by c.id)
    from private.chat_communities c join private.chat_community_leden m on m.community = c.id
    where m.gebruiker = v_id and m.status in ('lid', 'uitgenodigd') and not c.weg), '[]'::jsonb));
end; $$;

create or replace function public.chat_community_maken(p_naam text, p_wachtwoord text, p_community text, p_omschrijving text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_c bigint;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if trim(coalesce(p_community, '')) = '' then return jsonb_build_object('fout', 'Geef de community een naam.'); end if;
  if (select count(*) from private.chat_communities where maker = v_id and aangemaakt > now() - interval '1 day') >= 10 then
    return jsonb_build_object('fout', 'Je hebt vandaag al veel community''s gemaakt.');
  end if;
  insert into private.chat_communities (naam, omschrijving, maker, code)
  values (left(trim(p_community), 60), left(coalesce(p_omschrijving, ''), 300), v_id,
          upper(encode(extensions.gen_random_bytes(6), 'hex')))
  returning id into v_c;
  insert into private.chat_gesprekken (soort, naam, maker, community, positie, alleen_beheer)
  values ('groep', 'mededelingen', v_id, v_c, 0, true), ('groep', 'algemeen', v_id, v_c, 1, false);
  perform private.chat_community_lid_worden(v_c, v_id, 'eigenaar');
  return jsonb_build_object('ok', true, 'id', v_c);
end; $$;

-- Alles van één community: leden met hun rol, en de uitnodigingscode (alleen voor beheerders).
create or replace function public.chat_community(p_naam text, p_wachtwoord text, p_community bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_rol text; c private.chat_communities;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  v_rol := private.chat_community_rol(v_id, p_community);
  if v_rol is null then return jsonb_build_object('fout', 'Geen toegang.'); end if;
  select * into c from private.chat_communities where id = p_community and not weg;
  if not found then return jsonb_build_object('fout', 'Deze community bestaat niet meer.'); end if;
  return private.chat_community_json(c, v_id) || jsonb_build_object(
    'code', case when v_rol in ('eigenaar', 'beheerder') then c.code end, 'code_aan', c.code_aan,
    'deelnemers', coalesce((select jsonb_agg(jsonb_build_object('id', m.gebruiker, 'naam', private.weergave(m.gebruiker),
        'gebruikersnaam', u.naam, 'rol', m.rol, 'status', m.status) order by m.rol <> 'eigenaar', m.rol <> 'beheerder',
        lower(private.weergave(m.gebruiker)))
      from private.chat_community_leden m join private.gebruikers u on u.id = m.gebruiker
      where m.community = p_community and m.status in ('lid', 'uitgenodigd')), '[]'::jsonb));
end; $$;

create or replace function public.chat_community_deelnemen(p_naam text, p_wachtwoord text, p_code text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); c private.chat_communities; v_status text;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if (select count(*) from private.chat_code_pogingen where gebruiker = v_id and tijd > now() - interval '1 hour') >= 20 then
    return jsonb_build_object('fout', 'Te veel pogingen. Probeer het over een uur opnieuw.');
  end if;
  insert into private.chat_code_pogingen (gebruiker) values (v_id);
  select * into c from private.chat_communities
  where code = upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Fa-f]', '', 'g')) and code_aan and not weg;
  if not found then return jsonb_build_object('fout', 'Deze code klopt niet (meer).'); end if;
  select status into v_status from private.chat_community_leden where community = c.id and gebruiker = v_id;
  if v_status = 'geweerd' then return jsonb_build_object('fout', 'Je kunt niet meer meedoen met deze community.'); end if;
  if not private.chat_heeft_apparaat(v_id) then return jsonb_build_object('fout', 'Open eerst de chat op dit apparaat.'); end if;
  if (select count(*) from private.chat_community_leden where community = c.id and status = 'lid') >= 250 then
    return jsonb_build_object('fout', 'Deze community is vol (250 leden).');
  end if;
  perform private.chat_community_lid_worden(c.id, v_id, 'lid');
  return jsonb_build_object('ok', true, 'id', c.id, 'naam', c.naam);
end; $$;

-- Iemand uitnodigen. Wie jou als contact heeft, doet meteen mee; anders komt het binnen als uitnodiging.
create or replace function public.chat_community_uitnodigen(p_naam text, p_wachtwoord text, p_community bigint, p_wie text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_ander bigint; v_status text;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if private.chat_community_rol(v_id, p_community) is null then return jsonb_build_object('fout', 'Geen toegang.'); end if;
  select id into v_ander from private.gebruikers
  where naam = lower(trim(both '@ ' from coalesce(p_wie, ''))) and not verwijderd and not geblokkeerd;
  if v_ander is null then return jsonb_build_object('fout', 'Geen gebruiker met die naam.'); end if;
  if private.chat_geblokkeerd(v_id, v_ander) then return jsonb_build_object('fout', 'Dat kan niet.'); end if;
  if not private.chat_heeft_apparaat(v_ander) then
    return jsonb_build_object('fout', 'Deze persoon gebruikt de chat nog niet. Vraag of die de chat één keer opent.');
  end if;
  select status into v_status from private.chat_community_leden where community = p_community and gebruiker = v_ander;
  if v_status = 'lid' then return jsonb_build_object('fout', 'Doet al mee.'); end if;
  if v_status = 'geweerd' then return jsonb_build_object('fout', 'Deze persoon is geweerd uit de community.'); end if;
  if (select count(*) from private.chat_community_leden where community = p_community and status = 'lid') >= 250 then
    return jsonb_build_object('fout', 'Deze community is vol (250 leden).');
  end if;
  if private.chat_is_contact(v_ander, v_id) then
    perform private.chat_community_lid_worden(p_community, v_ander, 'lid');
    update private.chat_community_leden set door = v_id where community = p_community and gebruiker = v_ander;
    return jsonb_build_object('ok', true, 'status', 'lid');
  end if;
  insert into private.chat_community_leden (community, gebruiker, rol, status, door) values (p_community, v_ander, 'lid', 'uitgenodigd', v_id)
  on conflict (community, gebruiker) do update set status = 'uitgenodigd', door = v_id;
  return jsonb_build_object('ok', true, 'status', 'uitgenodigd');
end; $$;

create or replace function public.chat_community_antwoorden(p_naam text, p_wachtwoord text, p_community bigint, p_antwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_status text; v_rol text;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select status, rol into v_status, v_rol from private.chat_community_leden where community = p_community and gebruiker = v_id;
  if p_antwoord = 'ja' and v_status = 'uitgenodigd' then
    perform private.chat_community_lid_worden(p_community, v_id, 'lid');
  elsif p_antwoord in ('nee', 'verlaten') and v_status in ('uitgenodigd', 'lid') then
    if v_rol = 'eigenaar' and v_status = 'lid' then
      return jsonb_build_object('fout', 'Maak eerst iemand anders eigenaar, of verwijder de community.');
    end if;
    update private.chat_community_leden set status = 'weg', rol = 'lid' where community = p_community and gebruiker = v_id;
    update private.chat_leden l set status = 'weg', beheerder = false, gewijzigd = now()
    from private.chat_gesprekken g where g.id = l.gesprek and g.community = p_community and l.gebruiker = v_id;
  else
    return jsonb_build_object('fout', 'Dit kan niet (meer).');
  end if;
  return jsonb_build_object('ok', true);
end; $$;

-- Beheer: naam, omschrijving, uitnodigingscode aan/uit of vernieuwen, of de community opheffen (alleen de eigenaar).
create or replace function public.chat_community_instellen(p_naam text, p_wachtwoord text, p_community bigint,
    p_titel text, p_omschrijving text, p_code_aan boolean, p_nieuwe_code boolean, p_opheffen boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_rol text;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  v_rol := private.chat_community_rol(v_id, p_community);
  if v_rol is null or v_rol = 'lid' then return jsonb_build_object('fout', 'Alleen beheerders kunnen dit.'); end if;
  if coalesce(p_opheffen, false) then
    if v_rol <> 'eigenaar' then return jsonb_build_object('fout', 'Alleen de eigenaar kan de community opheffen.'); end if;
    update private.chat_communities set weg = true, code_aan = false where id = p_community;
    update private.chat_gesprekken set weg = true where community = p_community;
    update private.chat_leden l set status = 'weg', gewijzigd = now()
    from private.chat_gesprekken g where g.id = l.gesprek and g.community = p_community;
    update private.chat_berichten b set weg = true, inhoud = '', sleutels = '{}'::jsonb
    from private.chat_gesprekken g where g.id = b.gesprek and g.community = p_community and not b.weg;
    return jsonb_build_object('ok', true);
  end if;
  update private.chat_communities set
    naam = coalesce(nullif(left(trim(coalesce(p_titel, '')), 60), ''), naam),
    omschrijving = coalesce(left(p_omschrijving, 300), omschrijving),
    code_aan = coalesce(p_code_aan, code_aan),
    code = case when coalesce(p_nieuwe_code, false) then upper(encode(extensions.gen_random_bytes(6), 'hex')) else code end
  where id = p_community;
  return jsonb_build_object('ok', true);
end; $$;

-- Een lid beheerder maken, terug naar lid, eigenaar maken, verwijderen of weren (dan kan die niet terug met de code).
create or replace function public.chat_community_lid(p_naam text, p_wachtwoord text, p_community bigint, p_wie bigint, p_actie text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_rol text; v_hun text;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  v_rol := private.chat_community_rol(v_id, p_community);
  select rol into v_hun from private.chat_community_leden where community = p_community and gebruiker = p_wie and status in ('lid', 'uitgenodigd');
  if v_rol is null or v_rol = 'lid' or v_hun is null or p_wie = v_id then return jsonb_build_object('fout', 'Dat kan niet.'); end if;
  if v_hun = 'eigenaar' or (v_hun = 'beheerder' and v_rol <> 'eigenaar') then
    return jsonb_build_object('fout', 'Alleen de eigenaar kan dit bij een beheerder.');
  end if;
  if p_actie in ('beheerder', 'lid') then
    update private.chat_community_leden set rol = p_actie where community = p_community and gebruiker = p_wie;
    update private.chat_leden l set beheerder = p_actie = 'beheerder'
    from private.chat_gesprekken g where g.id = l.gesprek and g.community = p_community and l.gebruiker = p_wie;
  elsif p_actie = 'eigenaar' and v_rol = 'eigenaar' then
    update private.chat_community_leden set rol = 'beheerder' where community = p_community and gebruiker = v_id;
    update private.chat_community_leden set rol = 'eigenaar' where community = p_community and gebruiker = p_wie;
    update private.chat_leden l set beheerder = true
    from private.chat_gesprekken g where g.id = l.gesprek and g.community = p_community and l.gebruiker = p_wie;
  elsif p_actie in ('verwijderen', 'weren') then
    update private.chat_community_leden set status = case when p_actie = 'weren' then 'geweerd' else 'weg' end, rol = 'lid'
    where community = p_community and gebruiker = p_wie;
    update private.chat_leden l set status = 'weg', beheerder = false, gewijzigd = now()
    from private.chat_gesprekken g where g.id = l.gesprek and g.community = p_community and l.gebruiker = p_wie;
  else
    return jsonb_build_object('fout', 'Dat kan niet.');
  end if;
  return jsonb_build_object('ok', true);
end; $$;

create or replace function public.chat_kanaal_maken(p_naam text, p_wachtwoord text, p_community bigint, p_kanaal text,
                                                    p_alleen_beheer boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_g bigint; v_naam text;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if coalesce(private.chat_community_rol(v_id, p_community), 'lid') = 'lid' then
    return jsonb_build_object('fout', 'Alleen beheerders kunnen kanalen maken.');
  end if;
  v_naam := left(lower(regexp_replace(trim(both '# ' from coalesce(p_kanaal, '')), '\s+', '-', 'g')), 40);
  if v_naam = '' then return jsonb_build_object('fout', 'Geef het kanaal een naam.'); end if;
  if (select count(*) from private.chat_gesprekken where community = p_community and not weg) >= 50 then
    return jsonb_build_object('fout', 'Hoogstens 50 kanalen.');
  end if;
  insert into private.chat_gesprekken (soort, naam, maker, community, positie, alleen_beheer)
  values ('groep', v_naam, v_id, p_community,
          coalesce((select max(positie) + 1 from private.chat_gesprekken where community = p_community), 0),
          coalesce(p_alleen_beheer, false))
  returning id into v_g;
  insert into private.chat_leden (gesprek, gebruiker, status, beheerder)
  select v_g, m.gebruiker, 'lid', m.rol in ('eigenaar', 'beheerder')
  from private.chat_community_leden m where m.community = p_community and m.status = 'lid';
  return jsonb_build_object('ok', true, 'id', v_g);
end; $$;

create or replace function public.chat_kanaal_instellen(p_naam text, p_wachtwoord text, p_kanaal bigint, p_titel text,
                                                        p_alleen_beheer boolean, p_weg boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); g private.chat_gesprekken;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into g from private.chat_gesprekken where id = p_kanaal and community is not null and not weg;
  if not found or coalesce(private.chat_community_rol(v_id, g.community), 'lid') = 'lid' then
    return jsonb_build_object('fout', 'Alleen beheerders kunnen dit.');
  end if;
  if coalesce(p_weg, false) then
    if (select count(*) from private.chat_gesprekken where community = g.community and not weg) <= 1 then
      return jsonb_build_object('fout', 'Een community heeft minstens één kanaal.');
    end if;
    update private.chat_gesprekken set weg = true where id = p_kanaal;
    update private.chat_leden set status = 'weg', gewijzigd = now() where gesprek = p_kanaal;
    update private.chat_berichten set weg = true, inhoud = '', sleutels = '{}'::jsonb where gesprek = p_kanaal and not weg;
    return jsonb_build_object('ok', true);
  end if;
  update private.chat_gesprekken set
    naam = coalesce(nullif(left(lower(regexp_replace(trim(both '# ' from coalesce(p_titel, '')), '\s+', '-', 'g')), 40), ''), naam),
    alleen_beheer = coalesce(p_alleen_beheer, alleen_beheer)
  where id = p_kanaal;
  return jsonb_build_object('ok', true);
end; $$;

create or replace function public.chat_lid_toevoegen(p_naam text, p_wachtwoord text, p_gesprek bigint, p_wie text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_ander bigint; v_status text;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if not exists (select 1 from private.chat_leden l join private.chat_gesprekken g on g.id = l.gesprek
                 where l.gesprek = p_gesprek and l.gebruiker = v_id and l.status = 'lid' and l.beheerder and g.soort = 'groep'
                   and g.community is null) then
    return jsonb_build_object('fout', 'Alleen een beheerder van de groep kan mensen toevoegen.');
  end if;
  select id into v_ander from private.gebruikers
  where naam = lower(trim(both '@ ' from coalesce(p_wie, ''))) and not verwijderd and not geblokkeerd;
  if v_ander is null then return jsonb_build_object('fout', 'Geen gebruiker met die naam.'); end if;
  if private.chat_geblokkeerd(v_id, v_ander) then return jsonb_build_object('fout', 'Dat kan niet.'); end if;
  if not private.chat_heeft_apparaat(v_ander) then
    return jsonb_build_object('fout', 'Deze persoon gebruikt de chat nog niet. Vraag of die de chat één keer opent.');
  end if;
  if (select count(*) from private.chat_leden where gesprek = p_gesprek and status <> 'weg') >= 100 then
    return jsonb_build_object('fout', 'Een groep heeft hoogstens 100 mensen.');
  end if;
  v_status := case when private.chat_is_contact(v_ander, v_id) then 'lid' else 'verzoek' end;
  insert into private.chat_leden (gesprek, gebruiker, status) values (p_gesprek, v_ander, v_status)
  on conflict (gesprek, gebruiker) do update set status = case when private.chat_leden.status = 'lid' then 'lid' else v_status end,
    gewijzigd = now();
  return jsonb_build_object('ok', true);
end; $$;

create or replace function public.chat_versturen(p_naam text, p_wachtwoord text, p_gesprek bigint, p_apparaat bigint,
                                                 p_inhoud text, p_iv text, p_epk jsonb, p_sleutels jsonb,
                                                 p_handtekening text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); g private.chat_gesprekken; v_nieuw bigint;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into g from private.chat_gesprekken where id = p_gesprek and not weg;
  if not found or private.chat_lid(v_id, p_gesprek) is distinct from 'lid' then return jsonb_build_object('fout', 'Geen toegang.'); end if;
  if g.alleen_beheer and not private.chat_mag_beheren(v_id, p_gesprek) then
    return jsonb_build_object('fout', 'In dit kanaal kunnen alleen beheerders schrijven.');
  end if;
  if g.soort = 'twee' and exists (select 1 from private.chat_leden l where l.gesprek = g.id and l.gebruiker <> v_id
                                  and (l.status = 'weg' or private.chat_geblokkeerd(v_id, l.gebruiker))) then
    return jsonb_build_object('fout', 'Deze persoon kan je geen berichten meer sturen of ontvangen.');
  end if;
  if not exists (select 1 from private.chat_apparaten where id = p_apparaat and gebruiker = v_id and not weg) then
    return jsonb_build_object('fout', 'Dit apparaat is niet (meer) aangemeld voor de chat.');
  end if;
  if length(coalesce(p_inhoud, '')) > 2000000 or jsonb_typeof(p_sleutels) <> 'object' or length(p_sleutels::text) > 400000 then
    return jsonb_build_object('fout', 'Dit bericht is te groot.');
  end if;
  if (select count(*) from private.chat_berichten where afzender = v_id and aangemaakt > now() - interval '1 hour') >= 600 then
    return jsonb_build_object('fout', 'Je stuurt erg veel berichten. Wacht even.');
  end if;
  insert into private.chat_berichten (gesprek, afzender, apparaat, inhoud, iv, epk, sleutels, handtekening, verloopt)
  values (p_gesprek, v_id, p_apparaat, p_inhoud, left(p_iv, 64), p_epk, p_sleutels, left(p_handtekening, 400),
          case when g.verdwijnen is null then null else now() + make_interval(secs => g.verdwijnen) end)
  returning id into v_nieuw;
  update private.chat_gesprekken set laatst = now() where id = p_gesprek;
  update private.chat_leden set gelezen_tot = v_nieuw where gesprek = p_gesprek and gebruiker = v_id;
  if g.community is null or g.alleen_beheer then
    perform private.push_inplannen(l.gebruiker, now(), 'bericht', 'chat:' || p_gesprek,
      case when g.community is not null then (select c.naam from private.chat_communities c where c.id = g.community)
           when g.soort = 'groep' then g.naam else private.weergave(v_id) end,
      case when g.community is not null then '#' || g.naam || ': nieuwe mededeling'
           when g.soort = 'groep' then private.weergave(v_id) || ': nieuw bericht' else 'Nieuw bericht' end,
      coalesce((select rtrim(p.app_adres, '/') || '/chat?gesprek=' || p_gesprek from private.platform p
                where p.app_adres <> '' limit 1), ''))
    from private.chat_leden l where l.gesprek = p_gesprek and l.gebruiker <> v_id and l.status in ('lid', 'verzoek') and not l.stil;
  end if;
  return jsonb_build_object('ok', true, 'id', v_nieuw);
end; $$;

-- Een seintje aan wie je in een bericht noemt (@naam). Ook als het kanaal stil staat.
create or replace function public.chat_vermelden(p_naam text, p_wachtwoord text, p_bericht bigint, p_wie jsonb)
returns boolean language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); b private.chat_berichten; g private.chat_gesprekken;
begin
  if v_id is null then return false; end if;
  select * into b from private.chat_berichten where id = p_bericht and afzender = v_id and aangemaakt > now() - interval '10 minutes';
  if not found then return false; end if;
  select * into g from private.chat_gesprekken where id = b.gesprek;
  perform private.push_inplannen(l.gebruiker, now(), 'bericht', 'vermeld:' || p_bericht,
    coalesce((select c.naam || ' #' || g.naam from private.chat_communities c where c.id = g.community), nullif(g.naam, ''), 'Chat'),
    private.weergave(v_id) || ' noemde je',
    coalesce((select rtrim(p.app_adres, '/') || '/chat?gesprek=' || g.id from private.platform p
              where p.app_adres <> '' limit 1), ''))
  from private.chat_leden l
  where l.gesprek = g.id and l.status = 'lid' and l.gebruiker <> v_id and l.gebruiker in (select x::bigint from jsonb_array_elements_text(
    case when jsonb_typeof(p_wie) = 'array' then p_wie else '[]'::jsonb end) with ordinality as w(x, n) where x ~ '^[0-9]+$' and n <= 20);
  return true;
end; $$;

-- Vastzetten: in een gesprek met twee iedereen, in een groep of kanaal alleen beheerders.
create or replace function public.chat_vastzetten(p_naam text, p_wachtwoord text, p_bericht bigint, p_aan boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); b private.chat_berichten;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into b from private.chat_berichten where id = p_bericht and not weg;
  if not found or not coalesce(private.chat_mag_beheren(v_id, b.gesprek), false) then
    return jsonb_build_object('fout', 'Alleen beheerders kunnen berichten vastzetten.');
  end if;
  if coalesce(p_aan, true) and (select count(*) from private.chat_berichten where gesprek = b.gesprek and vast and not weg) >= 20 then
    return jsonb_build_object('fout', 'Hoogstens 20 vastgezette berichten.');
  end if;
  update private.chat_berichten set vast = coalesce(p_aan, true) where id = p_bericht;
  return jsonb_build_object('ok', true);
end; $$;

-- Eigen bericht weghalen, of als beheerder van een groep of kanaal een bericht van een ander.
create or replace function public.chat_bericht_weg(p_naam text, p_wachtwoord text, p_bericht bigint)
returns boolean language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return false; end if;
  update private.chat_berichten b set weg = true, inhoud = '', sleutels = '{}'::jsonb, vast = false
  where b.id = p_bericht and (b.afzender = v_id or exists (select 1 from private.chat_gesprekken g
        where g.id = b.gesprek and g.soort = 'groep' and private.chat_mag_beheren(v_id, g.id)));
  return found;
end; $$;

-- Berichten: met p_na = 0 de laatste 200, daarna alles na dat nummer. Alleen de sleutel voor dit apparaat.
create or replace function public.chat_berichten(p_naam text, p_wachtwoord text, p_gesprek bigint, p_na bigint,
                                                 p_apparaat bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if private.chat_lid(v_id, p_gesprek) not in ('lid', 'verzoek') or private.chat_lid(v_id, p_gesprek) is null then
    return jsonb_build_object('fout', 'Geen toegang.');
  end if;
  return jsonb_build_object('berichten', coalesce((select jsonb_agg(x order by (x ->> 'id')::bigint) from (
    select jsonb_build_object('id', b.id, 'afzender', b.afzender, 'apparaat', b.apparaat, 'aangemaakt', b.aangemaakt,
      'verloopt', b.verloopt, 'weg', b.weg, 'vast', b.vast,
      'inhoud', case when b.weg then null else b.inhoud end, 'iv', b.iv, 'epk', b.epk,
      'sleutel', case when b.weg then null else b.sleutels -> p_apparaat::text end,
      'handtekening', b.handtekening, 'teken', a.teken, 'vingerafdruk', a.vingerafdruk) x
    from private.chat_berichten b join private.chat_apparaten a on a.id = b.apparaat
    join private.chat_apparaten mijn on mijn.id = p_apparaat and mijn.gebruiker = v_id
    where b.gesprek = p_gesprek and b.id > coalesce(p_na, 0)
      and (b.sleutels ? p_apparaat::text or (b.weg and b.aangemaakt >= mijn.aangemaakt))
    order by case when coalesce(p_na, 0) <= 0 then -b.id else b.id end limit 200) s), '[]'::jsonb),
    'gesprek', (select private.chat_gesprek_json(g, v_id) from private.chat_gesprekken g where g.id = p_gesprek));
end; $$;

revoke all on function private.chat_community_rol(bigint, bigint) from public, anon, authenticated;
revoke all on function private.chat_mag_beheren(bigint, bigint) from public, anon, authenticated;
revoke all on function private.chat_community_lid_worden(bigint, bigint, text) from public, anon, authenticated;
revoke all on function private.chat_community_json(private.chat_communities, bigint) from public, anon, authenticated;
