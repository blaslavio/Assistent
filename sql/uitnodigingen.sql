-- Uitnodigen voor één afspraak: de gast ziet de afspraak (titel, tijd, plaats; nooit notities) in zijn eigen agenda,
-- antwoordt met ja, nee of misschien en kan reageren (op tijd, later, kan niet, opmerking).
-- Weghalen zet weg = true; rijen blijven bestaan.

create table if not exists private.agenda_uitnodigingen (
  id bigint generated always as identity primary key,
  eigenaar bigint not null references private.gebruikers(id),
  afspraak text not null,
  gast bigint not null references private.gebruikers(id),
  antwoord text not null default '' check (antwoord in ('', 'ja', 'nee', 'misschien')),
  weg boolean not null default false,
  aangemaakt timestamptz not null default now(),
  beantwoord timestamptz,
  unique (eigenaar, afspraak, gast)
);
create index if not exists agenda_uitnodigingen_gast on private.agenda_uitnodigingen (gast) where not weg;
alter table private.agenda_uitnodigingen enable row level security;

create or replace function private.uitgenodigd(p_id bigint, p_eigenaar bigint, p_afspraak text)
returns boolean language sql stable security definer set search_path to '' as $$
  select exists (select 1 from private.agenda_uitnodigingen u join private.gebruikers g on g.id = u.eigenaar
                 where u.gast = p_id and u.eigenaar = p_eigenaar and u.afspraak = p_afspraak and not u.weg
                   and not g.verwijderd)
$$;

-- Wat een gast van de afspraak mag zien: titel, tijd, plaats en soort (nooit de notitie), plus wie er nog komen.
create or replace function private.uitnodiging_json(u private.agenda_uitnodigingen)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('id', u.id, 'eigenaar', u.eigenaar, 'van', private.weergave(u.eigenaar),
           'gast', private.weergave(u.gast), 'afspraak', u.afspraak, 'antwoord', u.antwoord,
           'titel', a->>'titel', 'start', a->>'start', 'einde', a->>'einde', 'locatie', coalesce(a->>'locatie', ''),
           'soort', coalesce(a->>'soort', ''),
           'gasten', coalesce((select jsonb_agg(jsonb_build_object('naam', private.weergave(o.gast), 'antwoord', o.antwoord)
                                                order by o.id)
                               from private.agenda_uitnodigingen o
                               where o.eigenaar = u.eigenaar and o.afspraak = u.afspraak and not o.weg), '[]'::jsonb))
  from public.gegevens g, jsonb_array_elements(coalesce(g.data->'afspraken', '[]'::jsonb)) a
  where g.id = u.eigenaar and a->>'id' = u.afspraak
  limit 1
$$;

create or replace function public.agenda_uitnodigen(p_naam text, p_wachtwoord text, p_afspraak text, p_gast text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_gast bigint; v_u private.agenda_uitnodigingen;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if private.afspraak_titel(v_id, p_afspraak) is null then
    return jsonb_build_object('fout', 'Deze afspraak bestaat niet meer.');
  end if;
  select id into v_gast from private.gebruikers
  where naam = lower(trim(p_gast)) and not verwijderd and not geblokkeerd;
  if v_gast is null then return jsonb_build_object('fout', 'Geen gebruiker met die naam.'); end if;
  if v_gast = v_id then return jsonb_build_object('fout', 'Dat ben je zelf.'); end if;
  if (select count(*) from private.agenda_uitnodigingen where eigenaar = v_id and afspraak = p_afspraak and not weg) >= 30 then
    return jsonb_build_object('fout', 'Je hebt al 30 mensen uitgenodigd voor deze afspraak.');
  end if;
  if (select count(*) from private.agenda_uitnodigingen where eigenaar = v_id and aangemaakt > now() - interval '1 day') >= 100 then
    return jsonb_build_object('fout', 'Je hebt vandaag al heel veel mensen uitgenodigd. Probeer het morgen opnieuw.');
  end if;
  insert into private.agenda_uitnodigingen (eigenaar, afspraak, gast) values (v_id, p_afspraak, v_gast)
  on conflict (eigenaar, afspraak, gast) do update
    set weg = false, antwoord = case when private.agenda_uitnodigingen.weg then '' else private.agenda_uitnodigingen.antwoord end,
        aangemaakt = case when private.agenda_uitnodigingen.weg then now() else private.agenda_uitnodigingen.aangemaakt end
  returning * into v_u;
  return private.uitnodiging_json(v_u);
end; $$;

-- De eigenaar haalt een gast weg, of de gast haalt de uitnodiging uit zijn agenda.
create or replace function public.agenda_uitnodiging_weg(p_naam text, p_wachtwoord text, p_id bigint)
returns boolean language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return false; end if;
  update private.agenda_uitnodigingen set weg = true where id = p_id and (eigenaar = v_id or gast = v_id);
  return found;
end; $$;

create or replace function public.agenda_antwoorden(p_naam text, p_wachtwoord text, p_id bigint, p_antwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_u private.agenda_uitnodigingen;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if p_antwoord not in ('ja', 'nee', 'misschien') then return jsonb_build_object('fout', 'Kies ja, nee of misschien.'); end if;
  update private.agenda_uitnodigingen set antwoord = p_antwoord, beantwoord = now()
  where id = p_id and gast = v_id and not weg returning * into v_u;
  if v_u.id is null then return jsonb_build_object('fout', 'Deze uitnodiging bestaat niet meer.'); end if;
  return private.uitnodiging_json(v_u);
end; $$;

-- Voor de eigenaar: wie er bij zijn afspraken is uitgenodigd en wat ze antwoordden.
create or replace function public.agenda_gasten(p_naam text, p_wachtwoord text, p_afspraken text[])
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object('gasten', coalesce((
    select jsonb_agg(jsonb_build_object('id', u.id, 'afspraak', u.afspraak, 'naam', private.weergave(u.gast),
                                        'antwoord', u.antwoord) order by u.id)
    from private.agenda_uitnodigingen u join private.gebruikers g on g.id = u.gast
    where u.eigenaar = v_id and u.afspraak = any(p_afspraken) and not u.weg and not g.verwijderd), '[]'::jsonb));
end; $$;

-- Voor de gast: de afspraken waarvoor je bent uitgenodigd (tussen twee datums), met de reacties erbij.
create or replace function public.mijn_uitnodigingen(p_naam text, p_wachtwoord text, p_van text, p_tot text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object('uitnodigingen', coalesce((
    select jsonb_agg(j || jsonb_build_object('reacties', coalesce((
             select jsonb_agg(private.reactie_json(r) order by r.id) from private.agenda_reacties r
             where r.eigenaar = (j->>'eigenaar')::bigint and r.afspraak = j->>'afspraak' and not r.weg), '[]'::jsonb))
           order by j->>'start')
    from (select private.uitnodiging_json(u) j from private.agenda_uitnodigingen u
          join private.gebruikers g on g.id = u.eigenaar
          where u.gast = v_id and not u.weg and not g.verwijderd) x
    where j is not null and left(j->>'start', 10) between left(p_van, 10) and left(p_tot, 10)), '[]'::jsonb));
end; $$;

create or replace function public.agenda_reageren(p_naam text, p_wachtwoord text, p_eigenaar bigint, p_afspraak text,
                                                  p_soort text, p_minuten integer, p_tekst text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_r private.agenda_reacties;
        v_eigenaar bigint := coalesce(p_eigenaar, v_id);  -- leeg: je eigen agenda
        v_gast boolean;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  v_gast := private.uitgenodigd(v_id, v_eigenaar, p_afspraak);
  if not v_gast and coalesce(private.agenda_toegang(v_id, v_eigenaar), 'bezet') = 'bezet' then
    return jsonb_build_object('fout', 'Je kunt hier niet reageren.');
  end if;
  if private.afspraak_titel(v_eigenaar, p_afspraak) is null
     or (v_eigenaar <> v_id and not v_gast and private.afspraak_prive(v_eigenaar, p_afspraak)) then
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
            and (private.uitgenodigd(v_id, r.eigenaar, r.afspraak)
                 or (private.agenda_toegang(v_id, r.eigenaar) in ('eigen', 'details')
                     and (r.eigenaar = v_id or not private.afspraak_prive(r.eigenaar, r.afspraak))))
          order by r.id desc limit 20) r), '[]'::jsonb),
    -- Nieuwe uitnodigingen voor jou, en antwoorden op jouw uitnodigingen.
    'uitnodigingen', coalesce((select jsonb_agg(private.uitnodiging_json(u) order by u.id desc)
      from (select * from private.agenda_uitnodigingen u
            where u.gast = v_id and not u.weg and u.antwoord = '' and u.aangemaakt > greatest(p_sinds, now() - interval '14 days')
              and private.afspraak_titel(u.eigenaar, u.afspraak) is not null
            order by u.id desc limit 10) u), '[]'::jsonb),
    'antwoorden', coalesce((select jsonb_agg(private.uitnodiging_json(u) order by u.id desc)
      from (select * from private.agenda_uitnodigingen u
            where u.eigenaar = v_id and not u.weg and u.antwoord <> ''
              and u.beantwoord > greatest(p_sinds, now() - interval '14 days')
            order by u.beantwoord desc limit 10) u), '[]'::jsonb));
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
  update private.agenda_uitnodigingen set weg = true where eigenaar = v_id or gast = v_id;
  update private.project_leden set actief = false where gebruiker_id = v_id;
  update private.gebruikers set verwijderd = true, naam = null, email = null, weergavenaam = 'Verwijderd account',
         hash = extensions.crypt(extensions.gen_random_uuid()::text, extensions.gen_salt('bf', 4))
  where id = v_id;
  return true;
end; $$;

-- --- Rechten --------------------------------------------------------------------------------

revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function public.agenda_uitnodigen(text, text, text, text), public.agenda_uitnodiging_weg(text, text, bigint),
  public.agenda_antwoorden(text, text, bigint, text), public.agenda_gasten(text, text, text[]),
  public.mijn_uitnodigingen(text, text, text, text) from public;
grant execute on function public.agenda_uitnodigen(text, text, text, text), public.agenda_uitnodiging_weg(text, text, bigint),
  public.agenda_antwoorden(text, text, bigint, text), public.agenda_gasten(text, text, text[]),
  public.mijn_uitnodigingen(text, text, text, text) to anon, authenticated;
