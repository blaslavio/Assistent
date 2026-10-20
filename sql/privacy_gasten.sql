-- Privacy voorop: niemand ziet gegevens van een ander zonder toestemming of uitnodiging.
-- De eigenaar stelt per afspraak in wie mag reageren, wie de gastenlijst ziet en wie de reacties ziet.
-- Standaard: gasten zien alleen aantallen, en van andermans reacties alleen die van de eigenaar en hun eigen.

-- Wat de eigenaar per afspraak heeft ingesteld (afspraak.zichtbaar in zijn gegevens), met privacy-vriendelijke standaard:
--   reageren:    'iedereen' (gasten en wie meekijkt), 'gasten' of 'niemand'
--   gastenlijst: 'ik' (gasten zien alleen aantallen) of 'gasten' (gasten zien namen en antwoorden)
--   reacties:    'ik' (anderen zien alleen jouw reacties en hun eigen) of 'gasten' (iedereen ziet alle reacties)
create or replace function private.zichtbaar(p_eigenaar bigint, p_afspraak text, p_sleutel text)
returns text language sql stable security definer set search_path to '' as $$
  select coalesce((select a->'zichtbaar'->>p_sleutel
                   from public.gegevens g, jsonb_array_elements(coalesce(g.data->'afspraken', '[]'::jsonb)) a
                   where g.id = p_eigenaar and a->>'id' = p_afspraak limit 1),
                  case p_sleutel when 'reageren' then 'iedereen' else 'ik' end)
$$;

create or replace function private.mag_reageren(p_id bigint, p_eigenaar bigint, p_afspraak text)
returns boolean language sql stable security definer set search_path to '' as $$
  select p_id = p_eigenaar or case private.zichtbaar(p_eigenaar, p_afspraak, 'reageren')
    when 'niemand' then false
    when 'gasten' then private.uitgenodigd(p_id, p_eigenaar, p_afspraak)
    else private.uitgenodigd(p_id, p_eigenaar, p_afspraak)
         or (private.agenda_toegang(p_id, p_eigenaar) = 'details' and not private.afspraak_prive(p_eigenaar, p_afspraak))
  end
$$;

-- Mag p_id deze reactie zien? De eigenaar altijd, de schrijver zelf altijd, reacties van de eigenaar iedereen met
-- toegang; reacties van anderen alleen als de eigenaar dat bij de afspraak heeft aangezet.
create or replace function private.reactie_zichtbaar(p_id bigint, r private.agenda_reacties)
returns boolean language sql stable security definer set search_path to '' as $$
  select p_id = r.eigenaar or r.door in (r.eigenaar, p_id)
         or private.zichtbaar(r.eigenaar, r.afspraak, 'reacties') = 'gasten'
$$;

create or replace function private.uitnodiging_json(u private.agenda_uitnodigingen)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('id', u.id, 'eigenaar', u.eigenaar, 'van', private.weergave(u.eigenaar),
           'gast', private.weergave(u.gast), 'afspraak', u.afspraak, 'antwoord', u.antwoord,
           'titel', a->>'titel', 'start', a->>'start', 'einde', a->>'einde', 'locatie', coalesce(a->>'locatie', ''),
           'soort', coalesce(a->>'soort', ''),
           -- Andere gasten als aantallen; namen alleen als de uitnodiger de gastenlijst voor gasten heeft aangezet.
           'aantallen', (select jsonb_build_object('ja', count(*) filter (where o.antwoord = 'ja'),
                                                   'misschien', count(*) filter (where o.antwoord = 'misschien'),
                                                   'nee', count(*) filter (where o.antwoord = 'nee'),
                                                   'open', count(*) filter (where o.antwoord = ''))
                         from private.agenda_uitnodigingen o
                         where o.eigenaar = u.eigenaar and o.afspraak = u.afspraak and not o.weg),
           'gasten', case when private.zichtbaar(u.eigenaar, u.afspraak, 'gastenlijst') = 'gasten' then coalesce((
             select jsonb_agg(jsonb_build_object('naam', private.weergave(o.gast), 'antwoord', o.antwoord) order by o.id)
             from private.agenda_uitnodigingen o
             where o.eigenaar = u.eigenaar and o.afspraak = u.afspraak and not o.weg), '[]'::jsonb) else '[]'::jsonb end,
           'mag_reageren', private.mag_reageren(u.gast, u.eigenaar, u.afspraak))
  from public.gegevens g, jsonb_array_elements(coalesce(g.data->'afspraken', '[]'::jsonb)) a
  where g.id = u.eigenaar and a->>'id' = u.afspraak
  limit 1
$$;

create or replace function public.mijn_uitnodigingen(p_naam text, p_wachtwoord text, p_van text, p_tot text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object('uitnodigingen', coalesce((
    select jsonb_agg(j || jsonb_build_object('reacties', coalesce((
             select jsonb_agg(private.reactie_json(r) order by r.id) from private.agenda_reacties r
             where r.eigenaar = (j->>'eigenaar')::bigint and r.afspraak = j->>'afspraak' and not r.weg
               and private.reactie_zichtbaar(v_id, r)), '[]'::jsonb))
           order by j->>'start')
    from (select private.uitnodiging_json(u) j from private.agenda_uitnodigingen u
          join private.gebruikers g on g.id = u.eigenaar
          where u.gast = v_id and not u.weg and not g.verwijderd) x
    where j is not null and left(j->>'start', 10) between left(p_van, 10) and left(p_tot, 10)), '[]'::jsonb));
end; $$;

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
               where r.eigenaar = p_eigenaar and r.afspraak = a->>'id' and not r.weg
                 and private.reactie_zichtbaar(v_id, r)), '[]'::jsonb) end,
             'mag_reageren', v_niveau <> 'bezet' and private.mag_reageren(v_id, p_eigenaar, a->>'id'))
           order by a->>'start')
    from public.gegevens g, jsonb_array_elements(coalesce(g.data->'afspraken', '[]'::jsonb)) a
    where g.id = p_eigenaar and left(a->>'start', 10) between left(p_van, 10) and left(p_tot, 10)
      and coalesce(a->>'prive', 'false') <> 'true'), '[]'::jsonb));
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
  if not private.mag_reageren(v_id, v_eigenaar, p_afspraak) then
    return jsonb_build_object('fout', 'Reageren staat bij deze afspraak uit.');
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
            and private.reactie_zichtbaar(v_id, r)
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

revoke all on all functions in schema private from public, anon, authenticated;
