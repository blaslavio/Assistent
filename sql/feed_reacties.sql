-- Reageren op berichten in de feed, en een bericht delen met een link (?post=id). Wie het bericht mag zien, ziet ook
-- de reacties; reageren kan als je lid bent van de community. Hooguit 30 reacties per uur. Weghalen zet een vlag;
-- de schrijver en de beheerders van de community kunnen een reactie weghalen. Alleen toevoegen.

create table if not exists private.community_post_reacties (
  id bigint generated always as identity primary key,
  post bigint not null references private.community_posts(id),
  auteur bigint not null references private.gebruikers(id),
  tekst text not null check (length(tekst) between 1 and 500),
  aangemaakt timestamptz not null default now(),
  weg boolean not null default false
);
create index if not exists community_post_reacties_post on private.community_post_reacties (post, aangemaakt) where not weg;
create index if not exists community_post_reacties_auteur on private.community_post_reacties (auteur, aangemaakt);
alter table private.community_post_reacties enable row level security;

-- Zelfde als eerder, met het aantal reacties erbij.
create or replace function private.post_json(p private.community_posts, p_ik bigint)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('id', p.id, 'community', p.community, 'community_naam', c.naam, 'openbaar', c.openbaar,
    'lid', private.chat_community_rol(p_ik, c.id) is not null,
    'auteur', private.weergave(p.auteur), 'auteur_id', p.auteur, 'tekst', p.tekst, 'heeft_foto', p.foto is not null,
    'aangemaakt', p.aangemaakt,
    'leuk', (select count(*) from private.community_post_leuk l where l.post = p.id and l.aan),
    'ik_leuk', exists (select 1 from private.community_post_leuk l where l.post = p.id and l.gebruiker = p_ik and l.aan),
    'reacties', (select count(*) from private.community_post_reacties r where r.post = p.id and not r.weg),
    'van_mij', p.auteur = p_ik,
    'mag_weg', p.auteur = p_ik or coalesce(private.chat_community_rol(p_ik, c.id) in ('eigenaar', 'beheerder'), false))
  from private.chat_communities c where c.id = p.community
$$;

-- Eén bericht, voor een gedeelde link.
create or replace function public.community_post_bekijken(p_naam text, p_wachtwoord text, p_post bigint)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); p private.community_posts;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into p from private.community_posts where id = p_post and not weg;
  if p.id is null or not private.feed_zichtbaar(v_id, p.community) then
    return jsonb_build_object('fout', 'Dit bericht is er niet meer, of alleen leden van de community zien het.');
  end if;
  return jsonb_build_object('post', private.post_json(p, v_id));
end; $$;

create or replace function public.community_post_reacties(p_naam text, p_wachtwoord text, p_post bigint)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); p private.community_posts; v_beheer boolean;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into p from private.community_posts where id = p_post and not weg;
  if p.id is null or not private.feed_zichtbaar(v_id, p.community) then
    return jsonb_build_object('fout', 'Dit bericht is er niet meer.');
  end if;
  v_beheer := coalesce(private.chat_community_rol(v_id, p.community) in ('eigenaar', 'beheerder'), false);
  return jsonb_build_object('reacties', coalesce((select jsonb_agg(jsonb_build_object('id', r.id,
      'auteur', private.weergave(r.auteur), 'auteur_id', r.auteur, 'tekst', r.tekst, 'aangemaakt', r.aangemaakt,
      'mag_weg', r.auteur = v_id or v_beheer) order by r.aangemaakt)
    from (select * from private.community_post_reacties where post = p.id and not weg order by aangemaakt desc limit 200) r),
    '[]'::jsonb),
    'mag_reageren', private.chat_community_rol(v_id, p.community) is not null);
end; $$;

create or replace function public.community_post_reageren(p_naam text, p_wachtwoord text, p_post bigint, p_tekst text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); p private.community_posts; v_tekst text := trim(coalesce(p_tekst, ''));
  v_nieuw bigint;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into p from private.community_posts where id = p_post and not weg;
  if p.id is null or not private.feed_zichtbaar(v_id, p.community) then
    return jsonb_build_object('fout', 'Dit bericht is er niet meer.');
  end if;
  if private.chat_community_rol(v_id, p.community) is null then
    return jsonb_build_object('fout', 'Reageren kan als je lid bent van deze community.');
  end if;
  if v_tekst = '' then return jsonb_build_object('fout', 'Schrijf eerst iets.'); end if;
  if length(v_tekst) > 500 then return jsonb_build_object('fout', 'Hooguit 500 tekens.'); end if;
  if (select count(*) from private.community_post_reacties where auteur = v_id and aangemaakt > now() - interval '1 hour') >= 30 then
    return jsonb_build_object('fout', 'Je hebt veel gereageerd. Probeer het over een uur weer.');
  end if;
  insert into private.community_post_reacties (post, auteur, tekst) values (p.id, v_id, v_tekst) returning id into v_nieuw;
  return jsonb_build_object('ok', true, 'id', v_nieuw);
end; $$;

create or replace function public.community_reactie_weg(p_naam text, p_wachtwoord text, p_reactie bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); r private.community_post_reacties; v_community bigint;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into r from private.community_post_reacties where id = p_reactie and not weg;
  if r.id is null then return jsonb_build_object('fout', 'Deze reactie is er niet meer.'); end if;
  select community into v_community from private.community_posts where id = r.post;
  if r.auteur <> v_id and not coalesce(private.chat_community_rol(v_id, v_community) in ('eigenaar', 'beheerder'), false) then
    return jsonb_build_object('fout', 'Alleen de schrijver of een beheerder kan dit weghalen.');
  end if;
  update private.community_post_reacties set weg = true where id = r.id;
  return jsonb_build_object('ok', true);
end; $$;

grant execute on function public.community_post_bekijken(text, text, bigint) to anon, authenticated;
grant execute on function public.community_post_reacties(text, text, bigint) to anon, authenticated;
grant execute on function public.community_post_reageren(text, text, bigint, text) to anon, authenticated;
grant execute on function public.community_reactie_weg(text, text, bigint) to anon, authenticated;
