-- Privacy voorop: niemand ziet gegevens van een ander zonder diens toestemming.
-- * Een gast ziet niet wie er nog meer is uitgenodigd, alleen hoeveel mensen ja/nee/misschien zeiden.
-- * Reacties bij een afspraak ziet de eigenaar van de agenda; anderen zien alleen die van de eigenaar en hun eigen.

create or replace function private.uitnodiging_json(u private.agenda_uitnodigingen)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('id', u.id, 'eigenaar', u.eigenaar, 'van', private.weergave(u.eigenaar),
           'gast', private.weergave(u.gast), 'afspraak', u.afspraak, 'antwoord', u.antwoord,
           'titel', a->>'titel', 'start', a->>'start', 'einde', a->>'einde', 'locatie', coalesce(a->>'locatie', ''),
           'soort', coalesce(a->>'soort', ''),
           -- Andere gasten alleen als aantallen: wie er nog meer komt, is aan de uitnodiger, niet aan elkaar.
           'aantallen', (select jsonb_build_object('ja', count(*) filter (where o.antwoord = 'ja'),
                                                   'misschien', count(*) filter (where o.antwoord = 'misschien'),
                                                   'nee', count(*) filter (where o.antwoord = 'nee'),
                                                   'open', count(*) filter (where o.antwoord = ''))
                         from private.agenda_uitnodigingen o
                         where o.eigenaar = u.eigenaar and o.afspraak = u.afspraak and not o.weg))
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
               and r.door in (r.eigenaar, v_id)), '[]'::jsonb))  -- alleen van de uitnodiger en van jezelf
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
                 and r.door in (p_eigenaar, v_id)), '[]'::jsonb) end)  -- reacties van anderen blijven van hen
           order by a->>'start')
    from public.gegevens g, jsonb_array_elements(coalesce(g.data->'afspraken', '[]'::jsonb)) a
    where g.id = p_eigenaar and left(a->>'start', 10) between left(p_van, 10) and left(p_tot, 10)
      and coalesce(a->>'prive', 'false') <> 'true'), '[]'::jsonb));
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
            and (r.eigenaar = v_id or r.door = r.eigenaar)  -- in andermans agenda: alleen wat de eigenaar zelf zegt
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
