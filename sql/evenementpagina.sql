-- Na community_agenda.sql uitvoeren. Geen automatische productie-uitrol.
begin;
create or replace function public.community_evenement_bekijken(p_naam text, p_wachtwoord text, p_community bigint, p_id bigint)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam,p_wachtwoord); x private.community_activiteiten;
begin
  if v_id is null then return jsonb_build_object('geen_toegang',true); end if;
  if private.chat_community_rol(v_id,p_community) is null then return jsonb_build_object('fout','Geen toegang.'); end if;
  select * into x from private.community_activiteiten where id=p_id and community=p_community and not weg;
  if x.id is null then return jsonb_build_object('fout','Niet beschikbaar.'); end if;
  return jsonb_build_object('activiteit',private.ca_activiteit_json(x,v_id));
end; $$;
revoke all on function public.community_evenement_bekijken(text,text,bigint,bigint) from public;
grant execute on function public.community_evenement_bekijken(text,text,bigint,bigint) to anon,authenticated;
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
  if g->>'soort' = 'evenement' and (v_einde is null or v_einde <= v_start) then
    return jsonb_build_object('fout', 'Geef het evenement een eindtijd na het begin.');
  end if;
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


notify pgrst, 'reload schema';
commit;
