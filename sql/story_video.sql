-- Filmpjes tot een minuut in stories: een story mag groter zijn (8 MB versleuteld), met een grens per dag.

create or replace function public.chat_story_plaatsen(p_naam text, p_wachtwoord text, p_apparaat bigint, p_inhoud text,
                                                      p_iv text, p_epk jsonb, p_sleutels jsonb, p_handtekening text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_nieuw bigint;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if not exists (select 1 from private.chat_apparaten where id = p_apparaat and gebruiker = v_id and not weg) then
    return jsonb_build_object('fout', 'Dit apparaat is niet (meer) aangemeld voor de chat.');
  end if;
  if length(coalesce(p_inhoud, '')) > 8000000 or jsonb_typeof(p_sleutels) <> 'object' or length(p_sleutels::text) > 400000 then
    return jsonb_build_object('fout', 'Deze story is te groot.');
  end if;
  -- Alleen sleutels voor apparaten die de story ook echt mogen zien.
  if exists (select 1 from jsonb_object_keys(p_sleutels) k
             where k !~ '^[0-9]{1,18}$' or not exists (select 1 from private.chat_apparaten a
               where a.id = k::bigint and not a.weg and private.story_zichtbaar(v_id, a.gebruiker))) then
    return jsonb_build_object('fout', 'Je contacten zijn net veranderd. Probeer het opnieuw.');
  end if;
  if (select count(*) from private.chat_stories where maker = v_id and aangemaakt > now() - interval '1 day') >= 30 then
    return jsonb_build_object('fout', 'Je hebt vandaag al veel stories geplaatst.');
  end if;
  if (select coalesce(sum(length(inhoud)), 0) from private.chat_stories
      where maker = v_id and aangemaakt > now() - interval '1 day') + length(p_inhoud) > 80000000 then
    return jsonb_build_object('fout', 'Je hebt vandaag al veel filmpjes geplaatst. Morgen kan het weer.');
  end if;
  insert into private.chat_stories (maker, apparaat, inhoud, iv, epk, sleutels, handtekening)
  values (v_id, p_apparaat, p_inhoud, left(p_iv, 64), p_epk, p_sleutels, left(p_handtekening, 400))
  returning id into v_nieuw;
  return jsonb_build_object('ok', true, 'id', v_nieuw);
end; $$;

