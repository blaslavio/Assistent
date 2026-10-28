-- Feed voor community's: korte berichten (met eventueel een foto) die alle leden zien, en iedereen in de app als
-- de community openbaar is. Anders dan de kanalen is de feed NIET end-to-end versleuteld; dat staat ook in de app.
-- Wie lid is mag posten (hooguit 20 per uur). Drie meldingen verbergen een bericht. Weghalen zet alleen een vlag.
alter table private.chat_communities add column if not exists openbaar boolean not null default false;

create table if not exists private.community_posts (
  id bigint generated always as identity primary key,
  community bigint not null references private.chat_communities(id),
  auteur bigint not null references private.gebruikers(id),
  tekst text not null default '' check (length(tekst) <= 2000),
  foto text check (foto is null or length(foto) <= 1500000),
  aangemaakt timestamptz not null default now(),
  weg boolean not null default false
);
create index if not exists community_posts_community on private.community_posts (community, aangemaakt desc) where not weg;
create table if not exists private.community_post_leuk (
  post bigint not null references private.community_posts(id),
  gebruiker bigint not null references private.gebruikers(id),
  primary key (post, gebruiker)
);
create table if not exists private.community_post_meldingen (
  post bigint not null references private.community_posts(id),
  gebruiker bigint not null references private.gebruikers(id),
  reden text not null default '',
  aangemaakt timestamptz not null default now(),
  primary key (post, gebruiker)
);
alter table private.community_posts enable row level security;
alter table private.community_post_leuk enable row level security;
alter table private.community_post_meldingen enable row level security;

-- Zelfde als eerder, met 'openbaar' erbij.
create or replace function private.chat_community_json(c private.chat_communities, p_ik bigint)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('id', c.id, 'naam', c.naam, 'omschrijving', c.omschrijving, 'rol', m.rol, 'status', m.status,
    'door', private.weergave(m.door), 'openbaar', c.openbaar,
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

-- Mag deze gebruiker de feed van deze community zien? Leden altijd, anderen alleen als hij openbaar is.
create or replace function private.feed_zichtbaar(p_ik bigint, p_community bigint)
returns boolean language sql stable security definer set search_path to '' as $$
  select exists (select 1 from private.chat_communities c where c.id = p_community and not c.weg
                 and (c.openbaar or private.chat_community_rol(p_ik, c.id) is not null))
    and not exists (select 1 from private.chat_community_leden m where m.community = p_community and m.gebruiker = p_ik
                    and m.status = 'geweerd')
$$;

create or replace function private.post_json(p private.community_posts, p_ik bigint)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('id', p.id, 'community', p.community, 'community_naam', c.naam, 'openbaar', c.openbaar,
    'lid', private.chat_community_rol(p_ik, c.id) is not null,
    'auteur', private.weergave(p.auteur), 'auteur_id', p.auteur, 'tekst', p.tekst, 'heeft_foto', p.foto is not null,
    'aangemaakt', p.aangemaakt,
    'leuk', (select count(*) from private.community_post_leuk l where l.post = p.id),
    'ik_leuk', exists (select 1 from private.community_post_leuk l where l.post = p.id and l.gebruiker = p_ik),
    'van_mij', p.auteur = p_ik,
    'mag_weg', p.auteur = p_ik or coalesce(private.chat_community_rol(p_ik, c.id) in ('eigenaar', 'beheerder'), false))
  from private.chat_communities c where c.id = p.community
$$;

-- De feed. p_bron: alles (je community's en openbare), mijn (alleen waar je lid bent) of openbaar.
-- p_verborgen: community's die je zelf uit je feed hebt gehaald. p_voor: voor 'meer laden'. p_community: alleen die ene.
create or replace function public.community_feed(p_naam text, p_wachtwoord text, p_bron text, p_verborgen bigint[],
                                                 p_voor timestamptz, p_community bigint)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object('posts', coalesce((
    select jsonb_agg(private.post_json(x, v_id) order by x.aangemaakt desc)
    from (select p.* from private.community_posts p
          join private.chat_communities c on c.id = p.community and not c.weg
          join private.gebruikers g on g.id = p.auteur and not g.geblokkeerd and not g.verwijderd
          where not p.weg
            and (p.auteur = v_id or (select count(*) from private.community_post_meldingen m where m.post = p.id) < 3)
            and (p_community is null or p.community = p_community)
            and (p_community is not null or not (p.community = any (coalesce(p_verborgen, '{}'))))
            and (p_voor is null or p.aangemaakt < p_voor)
            and private.feed_zichtbaar(v_id, p.community)
            and case coalesce(p_bron, 'alles')
                  when 'mijn' then private.chat_community_rol(v_id, p.community) is not null
                  when 'openbaar' then c.openbaar
                  else true end
          order by p.aangemaakt desc limit 20) x), '[]'::jsonb));
end; $$;

create or replace function public.community_post_foto(p_naam text, p_wachtwoord text, p_post bigint)
returns text language plpgsql stable security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return null; end if;
  return (select p.foto from private.community_posts p where p.id = p_post and not p.weg
          and private.feed_zichtbaar(v_id, p.community));
end; $$;

create or replace function public.community_post_plaatsen(p_naam text, p_wachtwoord text, p_community bigint,
                                                          p_tekst text, p_foto text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_post bigint;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if private.chat_community_rol(v_id, p_community) is null then
    return jsonb_build_object('fout', 'Je kunt alleen posten in een community waar je lid van bent.');
  end if;
  if coalesce(trim(p_tekst), '') = '' and p_foto is null then return jsonb_build_object('fout', 'Schrijf iets of kies een foto.'); end if;
  if length(coalesce(p_tekst, '')) > 2000 then return jsonb_build_object('fout', 'Hooguit 2000 tekens.'); end if;
  if p_foto is not null and (p_foto !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$' or length(p_foto) > 1500000) then
    return jsonb_build_object('fout', 'Deze foto kan niet. Kies een kleinere jpg of png.');
  end if;
  if (select count(*) from private.community_posts where auteur = v_id and aangemaakt > now() - interval '1 hour') >= 20 then
    return jsonb_build_object('fout', 'Je hebt het afgelopen uur al veel geplaatst. Probeer het straks weer.');
  end if;
  insert into private.community_posts (community, auteur, tekst, foto)
  values (p_community, v_id, trim(coalesce(p_tekst, '')), p_foto) returning id into v_post;
  return jsonb_build_object('ok', true, 'id', v_post);
end; $$;

create or replace function public.community_post_weg(p_naam text, p_wachtwoord text, p_post bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  update private.community_posts p set weg = true
  where p.id = p_post and (p.auteur = v_id or private.chat_community_rol(v_id, p.community) in ('eigenaar', 'beheerder'));
  return jsonb_build_object('ok', found);
end; $$;

create or replace function public.community_post_leuk(p_naam text, p_wachtwoord text, p_post bigint, p_aan boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if not exists (select 1 from private.community_posts p where p.id = p_post and not p.weg
                 and private.feed_zichtbaar(v_id, p.community)) then
    return jsonb_build_object('fout', 'Dit bericht is er niet meer.');
  end if;
  if p_aan then
    insert into private.community_post_leuk (post, gebruiker) values (p_post, v_id) on conflict do nothing;
  else
    -- Een leuk-markering is van jou; terugnemen haalt alleen jouw eigen markering weg.
    delete from private.community_post_leuk where post = p_post and gebruiker = v_id;
  end if;
  return jsonb_build_object('ok', true);
end; $$;

create or replace function public.community_post_melden(p_naam text, p_wachtwoord text, p_post bigint, p_reden text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if not exists (select 1 from private.community_posts p where p.id = p_post and private.feed_zichtbaar(v_id, p.community)) then
    return jsonb_build_object('fout', 'Dit bericht is er niet meer.');
  end if;
  insert into private.community_post_meldingen (post, gebruiker, reden) values (p_post, v_id, left(coalesce(p_reden, ''), 300))
  on conflict do nothing;
  return jsonb_build_object('ok', true);
end; $$;

-- Openbaar maken: alleen eigenaar of beheerder. Alleen de feed wordt openbaar, de kanalen niet.
create or replace function public.community_openbaar_zetten(p_naam text, p_wachtwoord text, p_community bigint, p_aan boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if coalesce(private.chat_community_rol(v_id, p_community) not in ('eigenaar', 'beheerder'), true) then
    return jsonb_build_object('fout', 'Alleen de eigenaar of een beheerder kan dit.');
  end if;
  update private.chat_communities set openbaar = coalesce(p_aan, false) where id = p_community and not weg;
  return jsonb_build_object('ok', true, 'openbaar', coalesce(p_aan, false));
end; $$;

-- Openbare community's om te ontdekken, met of je al lid bent.
create or replace function public.openbare_communities(p_naam text, p_wachtwoord text, p_zoek text)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object('communities', coalesce((
    select jsonb_agg(x order by (x->>'leden')::int desc) from (
      select jsonb_build_object('id', c.id, 'naam', c.naam, 'omschrijving', c.omschrijving,
        'leden', (select count(*) from private.chat_community_leden m where m.community = c.id and m.status = 'lid'),
        'lid', private.chat_community_rol(v_id, c.id) is not null) as x
      from private.chat_communities c
      where c.openbaar and not c.weg
        and (coalesce(trim(p_zoek), '') = '' or c.naam ilike '%' || trim(p_zoek) || '%' or c.omschrijving ilike '%' || trim(p_zoek) || '%')
        and not exists (select 1 from private.chat_community_leden m where m.community = c.id and m.gebruiker = v_id
                        and m.status = 'geweerd')
      limit 30) s), '[]'::jsonb));
end; $$;

-- Meedoen met een openbare community, zonder code. Zelfde regels als met een code.
create or replace function public.community_openbaar_deelnemen(p_naam text, p_wachtwoord text, p_community bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); c private.chat_communities; v_status text;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into c from private.chat_communities where id = p_community and openbaar and not weg;
  if not found then return jsonb_build_object('fout', 'Deze community is niet (meer) openbaar.'); end if;
  select status into v_status from private.chat_community_leden where community = c.id and gebruiker = v_id;
  if v_status = 'geweerd' then return jsonb_build_object('fout', 'Je kunt niet meer meedoen met deze community.'); end if;
  if v_status = 'lid' then return jsonb_build_object('ok', true, 'id', c.id, 'naam', c.naam); end if;
  if not private.chat_heeft_apparaat(v_id) then return jsonb_build_object('fout', 'Open eerst de chat op dit apparaat.'); end if;
  if (select count(*) from private.chat_community_leden where community = c.id and status = 'lid') >= 250 then
    return jsonb_build_object('fout', 'Deze community is vol (250 leden).');
  end if;
  perform private.chat_community_lid_worden(c.id, v_id, 'lid');
  return jsonb_build_object('ok', true, 'id', c.id, 'naam', c.naam);
end; $$;

revoke all on function private.feed_zichtbaar(bigint, bigint), private.post_json(private.community_posts, bigint)
  from public, anon, authenticated;
revoke all on function public.community_feed(text, text, text, bigint[], timestamptz, bigint),
  public.community_post_foto(text, text, bigint), public.community_post_plaatsen(text, text, bigint, text, text),
  public.community_post_weg(text, text, bigint), public.community_post_leuk(text, text, bigint, boolean),
  public.community_post_melden(text, text, bigint, text), public.community_openbaar_zetten(text, text, bigint, boolean),
  public.openbare_communities(text, text, text), public.community_openbaar_deelnemen(text, text, bigint) from public;
grant execute on function public.community_feed(text, text, text, bigint[], timestamptz, bigint),
  public.community_post_foto(text, text, bigint), public.community_post_plaatsen(text, text, bigint, text, text),
  public.community_post_weg(text, text, bigint), public.community_post_leuk(text, text, bigint, boolean),
  public.community_post_melden(text, text, bigint, text), public.community_openbaar_zetten(text, text, bigint, boolean),
  public.openbare_communities(text, text, text), public.community_openbaar_deelnemen(text, text, bigint)
  to anon, authenticated;
