-- Agenda delen: iemand kijkt mee in je agenda en kan bij een afspraak reageren: een opmerking, "op tijd",
-- "ik ben later" (met minuten) of "kan niet". Jij kunt dat zelf ook, zodat wie meekijkt het ziet.
--
-- Je afspraken blijven in je eigen gegevens (public.gegevens); wie meekijkt krijgt alleen titel, tijd, locatie en
-- soort (nooit notities), of bij 'bezet' alleen dat je bezet bent. Stoppen met delen zet actief = false.

create table if not exists private.agenda_delen (
  id bigint generated always as identity primary key,
  eigenaar bigint not null references private.gebruikers(id),
  met bigint not null references private.gebruikers(id),
  niveau text not null default 'details' check (niveau in ('details', 'bezet')),
  actief boolean not null default true,
  aangemaakt timestamptz not null default now(),
  unique (eigenaar, met)
);
alter table private.agenda_delen enable row level security;

create table if not exists private.agenda_reacties (
  id bigint generated always as identity primary key,
  eigenaar bigint not null references private.gebruikers(id),   -- wiens agenda
  afspraak text not null,                                          -- id van de afspraak in diens gegevens
  door bigint not null references private.gebruikers(id),
  soort text not null check (soort in ('opmerking', 'op_tijd', 'later', 'kan_niet')),
  minuten integer check (minuten between 1 and 600),
  tekst text not null default '',
  weg boolean not null default false,
  aangemaakt timestamptz not null default now()
);
create index if not exists agenda_reacties_afspraak on private.agenda_reacties (eigenaar, afspraak);
create index if not exists agenda_reacties_tijd on private.agenda_reacties (aangemaakt);
alter table private.agenda_reacties enable row level security;

-- Mag v_id bij de agenda van p_eigenaar? Geeft het niveau ('eigen', 'details', 'bezet') of null.
create or replace function private.agenda_toegang(p_id bigint, p_eigenaar bigint)
returns text language sql stable security definer set search_path to '' as $$
  select case when p_id = p_eigenaar then 'eigen'
              else (select d.niveau from private.agenda_delen d
                    join private.gebruikers g on g.id = d.eigenaar
                    where d.eigenaar = p_eigenaar and d.met = p_id and d.actief and not g.verwijderd) end
$$;

create or replace function private.afspraak_titel(p_eigenaar bigint, p_afspraak text)
returns text language sql stable security definer set search_path to '' as $$
  select a->>'titel' from public.gegevens g, jsonb_array_elements(coalesce(g.data->'afspraken', '[]'::jsonb)) a
  where g.id = p_eigenaar and a->>'id' = p_afspraak limit 1
$$;

create or replace function private.reactie_json(r private.agenda_reacties)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('id', r.id, 'eigenaar', r.eigenaar, 'afspraak', r.afspraak, 'door', private.weergave(r.door),
                            'door_id', r.door, 'soort', r.soort, 'minuten', r.minuten, 'tekst', r.tekst,
                            'aangemaakt', r.aangemaakt)
$$;

-- Je agenda delen met een gebruikersnaam. Opnieuw delen met dezelfde persoon past het niveau aan.
create or replace function public.agenda_delen(p_naam text, p_wachtwoord text, p_met text, p_niveau text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_met bigint;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select id into v_met from private.gebruikers
  where naam = lower(trim(p_met)) and not verwijderd and not geblokkeerd;
  if v_met is null then return jsonb_build_object('fout', 'Geen gebruiker met die naam.'); end if;
  if v_met = v_id then return jsonb_build_object('fout', 'Dat ben je zelf.'); end if;
  if (select count(*) from private.agenda_delen where eigenaar = v_id and actief) >= 50 then
    return jsonb_build_object('fout', 'Je deelt je agenda al met 50 mensen.');
  end if;
  insert into private.agenda_delen (eigenaar, met, niveau)
  values (v_id, v_met, case when p_niveau = 'bezet' then 'bezet' else 'details' end)
  on conflict (eigenaar, met) do update set niveau = excluded.niveau, actief = true;
  return jsonb_build_object('ok', true, 'met', private.weergave(v_met));
end; $$;

-- Stoppen: de eigenaar stopt met delen, of wie meekijkt stopt met meekijken.
create or replace function public.agenda_delen_stoppen(p_naam text, p_wachtwoord text, p_ander bigint)
returns boolean language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return false; end if;
  update private.agenda_delen set actief = false
  where (eigenaar = v_id and met = p_ander) or (eigenaar = p_ander and met = v_id);
  return found;
end; $$;

create or replace function public.agenda_deelsituatie(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object(
    'ik_deel_met', coalesce((select jsonb_agg(jsonb_build_object('id', d.met, 'naam', private.weergave(d.met),
                                                                 'niveau', d.niveau) order by d.id)
                             from private.agenda_delen d join private.gebruikers g on g.id = d.met
                             where d.eigenaar = v_id and d.actief and not g.verwijderd), '[]'::jsonb),
    'met_mij', coalesce((select jsonb_agg(jsonb_build_object('id', d.eigenaar, 'naam', private.weergave(d.eigenaar),
                                                             'niveau', d.niveau) order by d.id)
                         from private.agenda_delen d join private.gebruikers g on g.id = d.eigenaar
                         where d.met = v_id and d.actief and not g.verwijderd), '[]'::jsonb));
end; $$;

-- De afspraken van iemand die zijn agenda met jou deelt (tussen twee datums), met de reacties erbij.
create or replace function public.gedeelde_agenda(p_naam text, p_wachtwoord text, p_eigenaar bigint, p_van text,
                                                  p_tot text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_niveau text;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  v_niveau := private.agenda_toegang(v_id, p_eigenaar);
  if v_niveau is null then return jsonb_build_object('fout', 'Deze agenda wordt niet (meer) met je gedeeld.'); end if;
  return jsonb_build_object('niveau', v_niveau, 'naam', private.weergave(p_eigenaar), 'afspraken', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', a->>'id', 'start', a->>'start', 'einde', a->>'einde',
             'titel', case when v_niveau = 'bezet' then 'Bezet' else a->>'titel' end,
             'locatie', case when v_niveau = 'bezet' then '' else coalesce(a->>'locatie', '') end,
             'soort', case when v_niveau = 'bezet' then '' else coalesce(a->>'soort', '') end,
             'reacties', case when v_niveau = 'bezet' then '[]'::jsonb else coalesce((
               select jsonb_agg(private.reactie_json(r) order by r.id) from private.agenda_reacties r
               where r.eigenaar = p_eigenaar and r.afspraak = a->>'id' and not r.weg), '[]'::jsonb) end)
           order by a->>'start')
    from public.gegevens g, jsonb_array_elements(coalesce(g.data->'afspraken', '[]'::jsonb)) a
    where g.id = p_eigenaar and left(a->>'start', 10) between left(p_van, 10) and left(p_tot, 10)
      and coalesce(a->>'prive', 'false') <> 'true'), '[]'::jsonb));
end; $$;

-- Reageren bij een afspraak in je eigen agenda (p_eigenaar leeg) of in een agenda die (met details) met je gedeeld is.
create or replace function public.agenda_reageren(p_naam text, p_wachtwoord text, p_eigenaar bigint, p_afspraak text,
                                                  p_soort text, p_minuten integer, p_tekst text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_r private.agenda_reacties;
        v_eigenaar bigint := coalesce(p_eigenaar, v_id);  -- leeg: je eigen agenda
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if coalesce(private.agenda_toegang(v_id, v_eigenaar), 'bezet') = 'bezet' then
    return jsonb_build_object('fout', 'Je kunt hier niet reageren.');
  end if;
  if private.afspraak_titel(v_eigenaar, p_afspraak) is null then
    return jsonb_build_object('fout', 'Deze afspraak bestaat niet meer.');
  end if;
  if p_soort not in ('opmerking', 'op_tijd', 'later', 'kan_niet') or (p_soort = 'opmerking' and trim(coalesce(p_tekst, '')) = '') then
    return jsonb_build_object('fout', 'Schrijf iets.');
  end if;
  if (select count(*) from private.agenda_reacties where door = v_id and aangemaakt > now() - interval '1 day') >= 200 then
    return jsonb_build_object('fout', 'Je hebt vandaag heel veel gereageerd. Probeer het morgen opnieuw.');
  end if;
  -- Een nieuwe status (op tijd, later, kan niet) vervangt je vorige status bij deze afspraak.
  if p_soort <> 'opmerking' then
    update private.agenda_reacties set weg = true
    where eigenaar = v_eigenaar and afspraak = p_afspraak and door = v_id and soort <> 'opmerking' and not weg;
  end if;
  insert into private.agenda_reacties (eigenaar, afspraak, door, soort, minuten, tekst)
  values (v_eigenaar, p_afspraak, v_id, p_soort, case when p_soort = 'later' then greatest(1, least(600, coalesce(p_minuten, 10))) end,
          left(trim(coalesce(p_tekst, '')), 500))
  returning * into v_r;
  return private.reactie_json(v_r);
end; $$;

create or replace function public.agenda_reactie_weg(p_naam text, p_wachtwoord text, p_id bigint)
returns boolean language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return false; end if;
  -- Je eigen reactie, of elke reactie in je eigen agenda.
  update private.agenda_reacties set weg = true where id = p_id and (door = v_id or eigenaar = v_id);
  return found;
end; $$;

-- Reacties bij afspraken in je eigen agenda (voor de afspraakkaarten).
create or replace function public.mijn_agenda_reacties(p_naam text, p_wachtwoord text, p_afspraken text[])
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object('reacties', coalesce((
    select jsonb_agg(private.reactie_json(r) order by r.id) from private.agenda_reacties r
    where r.eigenaar = v_id and r.afspraak = any(p_afspraken) and not r.weg), '[]'::jsonb));
end; $$;

-- Wat er sinds p_sinds nieuw is: reacties van anderen in jouw agenda, en in agenda's die met jou gedeeld zijn.
create or replace function public.agenda_nieuw(p_naam text, p_wachtwoord text, p_sinds timestamptz)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object('reacties', coalesce((
    select jsonb_agg(private.reactie_json(r) || jsonb_build_object(
             'titel', private.afspraak_titel(r.eigenaar, r.afspraak), 'van_agenda', private.weergave(r.eigenaar))
           order by r.id desc)
    from (select * from private.agenda_reacties r
          where not r.weg and r.door <> v_id and r.aangemaakt > greatest(p_sinds, now() - interval '14 days')
            and private.agenda_toegang(v_id, r.eigenaar) in ('eigen', 'details')
          order by r.id desc limit 20) r), '[]'::jsonb));
end; $$;

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
  update private.project_leden set actief = false where gebruiker_id = v_id;
  update private.gebruikers set verwijderd = true, naam = null, email = null, weergavenaam = 'Verwijderd account',
         hash = extensions.crypt(extensions.gen_random_uuid()::text, extensions.gen_salt('bf', 4))
  where id = v_id;
  return true;
end; $$;

-- --- Rechten --------------------------------------------------------------------------------

revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function public.agenda_delen(text, text, text, text), public.agenda_delen_stoppen(text, text, bigint),
  public.agenda_deelsituatie(text, text), public.gedeelde_agenda(text, text, bigint, text, text),
  public.agenda_reageren(text, text, bigint, text, text, integer, text), public.agenda_reactie_weg(text, text, bigint),
  public.mijn_agenda_reacties(text, text, text[]), public.agenda_nieuw(text, text, timestamptz),
  public.account_verwijderen(text, text) from public;
grant execute on function public.agenda_delen(text, text, text, text), public.agenda_delen_stoppen(text, text, bigint),
  public.agenda_deelsituatie(text, text), public.gedeelde_agenda(text, text, bigint, text, text),
  public.agenda_reageren(text, text, bigint, text, text, integer, text), public.agenda_reactie_weg(text, text, bigint),
  public.mijn_agenda_reacties(text, text, text[]), public.agenda_nieuw(text, text, timestamptz),
  public.account_verwijderen(text, text) to anon, authenticated;
