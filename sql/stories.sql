-- Stories in de chat: een foto of korte tekst die 24 uur te zien is, alleen voor je contacten.
-- Net als berichten end-to-end versleuteld: de sleutel wordt alleen ingepakt voor de apparaten van je contacten en
-- je eigen apparaten. Na 24 uur maakt de server de inhoud en de sleutels echt leeg.

create table if not exists private.chat_stories (
  id bigint generated always as identity primary key,
  maker bigint not null references private.gebruikers(id),
  apparaat bigint not null references private.chat_apparaten(id),
  inhoud text not null,
  iv text not null,
  epk jsonb not null,
  sleutels jsonb not null,
  handtekening text not null,
  aangemaakt timestamptz not null default now(),
  verloopt timestamptz not null default now() + interval '24 hours',
  weg boolean not null default false
);
create index if not exists chat_stories_maker on private.chat_stories (maker, id) where not weg;
create index if not exists chat_stories_verloopt on private.chat_stories (verloopt) where not weg;

create table if not exists private.chat_story_kijkers (
  story bigint not null references private.chat_stories(id),
  gebruiker bigint not null references private.gebruikers(id),
  gezien timestamptz not null default now(),
  primary key (story, gebruiker)
);

alter table private.chat_stories enable row level security;
alter table private.chat_story_kijkers enable row level security;

-- Mag p_kijker de stories van p_maker zien? Alleen als de maker hem als contact heeft en niemand de ander blokkeert.
create or replace function private.story_zichtbaar(p_maker bigint, p_kijker bigint)
returns boolean language sql stable security definer set search_path to '' as $$
  select p_maker = p_kijker or (private.chat_is_contact(p_maker, p_kijker)
    and not private.chat_geblokkeerd(p_maker, p_kijker)
    and exists (select 1 from private.gebruikers u where u.id = p_maker and not u.verwijderd and not u.geblokkeerd))
$$;

-- De openbare sleutels waarvoor je een story versleutelt: je eigen apparaten en die van je contacten.
create or replace function public.chat_story_sleutels(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object('apparaten', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'gebruiker', a.gebruiker,
      'ecdh', a.ecdh, 'vingerafdruk', a.vingerafdruk) order by a.id)
    from private.chat_apparaten a join private.gebruikers u on u.id = a.gebruiker
    where not a.weg and not u.verwijderd and private.story_zichtbaar(v_id, a.gebruiker)), '[]'::jsonb));
end; $$;

create or replace function public.chat_story_plaatsen(p_naam text, p_wachtwoord text, p_apparaat bigint, p_inhoud text,
                                                      p_iv text, p_epk jsonb, p_sleutels jsonb, p_handtekening text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_nieuw bigint;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if not exists (select 1 from private.chat_apparaten where id = p_apparaat and gebruiker = v_id and not weg) then
    return jsonb_build_object('fout', 'Dit apparaat is niet (meer) aangemeld voor de chat.');
  end if;
  if length(coalesce(p_inhoud, '')) > 3000000 or jsonb_typeof(p_sleutels) <> 'object' or length(p_sleutels::text) > 400000 then
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
  insert into private.chat_stories (maker, apparaat, inhoud, iv, epk, sleutels, handtekening)
  values (v_id, p_apparaat, p_inhoud, left(p_iv, 64), p_epk, p_sleutels, left(p_handtekening, 400))
  returning id into v_nieuw;
  return jsonb_build_object('ok', true, 'id', v_nieuw);
end; $$;

-- Alle stories die je nu mag zien, met alleen de sleutel voor dit apparaat. Bij je eigen stories: wie ze zag.
create or replace function public.chat_stories(p_naam text, p_wachtwoord text, p_apparaat bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if not exists (select 1 from private.chat_apparaten where id = p_apparaat and gebruiker = v_id and not weg) then
    return jsonb_build_object('fout', 'Dit apparaat is niet (meer) aangemeld voor de chat.');
  end if;
  return jsonb_build_object('stories', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'maker', s.maker,
      'naam', private.weergave(s.maker), 'apparaat', s.apparaat, 'aangemaakt', s.aangemaakt, 'verloopt', s.verloopt,
      'inhoud', s.inhoud, 'iv', s.iv, 'epk', s.epk, 'sleutel', s.sleutels -> p_apparaat::text,
      'handtekening', s.handtekening, 'teken', a.teken,
      'gezien', exists (select 1 from private.chat_story_kijkers k where k.story = s.id and k.gebruiker = v_id),
      'kijkers', case when s.maker = v_id then coalesce((select jsonb_agg(jsonb_build_object('naam',
          private.weergave(k.gebruiker), 'gezien', k.gezien) order by k.gezien desc)
        from private.chat_story_kijkers k where k.story = s.id), '[]'::jsonb) end)
      order by s.maker = v_id desc, s.maker, s.id)
    from private.chat_stories s join private.chat_apparaten a on a.id = s.apparaat
    where not s.weg and s.verloopt > now() and s.sleutels ? p_apparaat::text
      and private.story_zichtbaar(s.maker, v_id)), '[]'::jsonb));
end; $$;

create or replace function public.chat_story_gezien(p_naam text, p_wachtwoord text, p_story bigint)
returns boolean language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return false; end if;
  insert into private.chat_story_kijkers (story, gebruiker)
  select s.id, v_id from private.chat_stories s
  where s.id = p_story and s.maker <> v_id and not s.weg and s.verloopt > now() and private.story_zichtbaar(s.maker, v_id)
  on conflict do nothing;
  return true;
end; $$;

-- Een eigen story meteen weghalen.
create or replace function public.chat_story_weg(p_naam text, p_wachtwoord text, p_story bigint)
returns boolean language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return false; end if;
  update private.chat_stories set weg = true, inhoud = '', sleutels = '{}'::jsonb where id = p_story and maker = v_id;
  return found;
end; $$;

-- Verdwijnende berichten en verlopen stories echt leeg maken (elke tien minuten, via de bestaande planning).
create or replace function private.chat_opruimen()
returns void language plpgsql security definer set search_path to '' as $$
begin
  update private.chat_berichten set weg = true, inhoud = '', sleutels = '{}'::jsonb
  where verloopt is not null and verloopt < now() and not weg;
  update private.chat_stories set weg = true, inhoud = '', sleutels = '{}'::jsonb
  where verloopt < now() and not weg;
end; $$;

revoke all on function private.story_zichtbaar(bigint, bigint) from public, anon, authenticated;
revoke all on function private.chat_opruimen() from public, anon, authenticated;
