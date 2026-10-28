-- Community's opruimen zonder iets kwijt te raken.
-- * Bewaren: een community verdwijnt uit je lijst en staat onder Bewaard. Alleen voor jou; je blijft lid.
-- * Herinnering: de eigenaar zet de hele community op alleen-lezen. Alles blijft terug te lezen, niemand kan nog
--   schrijven. Handig na een vakantie, bruiloft of project.
-- * Tijdelijk: een community met een einddatum (de activiteit). Daarna wordt hij vanzelf een herinnering, of hij
--   wordt opgeheven als de eigenaar dat zo koos. Dat gebeurt bij het openen van de chat, er draait geen taak.
-- Alles is niet-destructief: opheffen zet "weg" en maakt berichten leeg, net als de bestaande knop Opheffen.

alter table private.chat_communities add column if not exists eindigt timestamptz;
alter table private.chat_communities add column if not exists na_afloop text not null default 'herinnering';
alter table private.chat_communities add column if not exists herinnering boolean not null default false;
alter table private.chat_communities add column if not exists herinnering_sinds timestamptz;
alter table private.chat_community_leden add column if not exists bewaard boolean not null default false;
do $$ begin
  alter table private.chat_communities add constraint chat_communities_na_afloop check (na_afloop in ('herinnering', 'opheffen'));
exception when duplicate_object then null; end $$;
create index if not exists chat_communities_eindigt on private.chat_communities (eindigt)
  where eindigt is not null and not weg and not herinnering;

-- Hetzelfde als Opheffen in chat_community_instellen, voor hergebruik.
create or replace function private.community_opheffen(p_community bigint)
returns void language plpgsql security definer set search_path to '' as $$
begin
  update private.chat_communities set weg = true, code_aan = false where id = p_community;
  update private.chat_gesprekken set weg = true where community = p_community;
  update private.chat_leden l set status = 'weg', gewijzigd = now()
  from private.chat_gesprekken g where g.id = l.gesprek and g.community = p_community;
  update private.chat_berichten b set weg = true, inhoud = '', sleutels = '{}'::jsonb
  from private.chat_gesprekken g where g.id = b.gesprek and g.community = p_community and not b.weg;
end; $$;

-- Verlopen tijdelijke community's afronden. Goedkoop: alleen wat over de einddatum is.
create or replace function private.communities_afronden()
returns void language plpgsql security definer set search_path to '' as $$
declare c record;
begin
  for c in select id, na_afloop from private.chat_communities
           where eindigt is not null and eindigt < now() and not weg and not herinnering limit 50 loop
    if c.na_afloop = 'opheffen' then
      perform private.community_opheffen(c.id);
    else
      update private.chat_communities set herinnering = true, herinnering_sinds = now(), code_aan = false where id = c.id;
    end if;
  end loop;
end; $$;

create or replace function private.chat_community_json(c private.chat_communities, p_ik bigint)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('id', c.id, 'naam', c.naam, 'omschrijving', c.omschrijving, 'rol', m.rol, 'status', m.status,
    'door', private.weergave(m.door), 'openbaar', c.openbaar,
    'eindigt', c.eindigt, 'na_afloop', c.na_afloop, 'herinnering', c.herinnering, 'herinnering_sinds', c.herinnering_sinds,
    'bewaard', m.bewaard, 'aangemaakt', c.aangemaakt,
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

create or replace function public.chat_gesprekken(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  perform private.communities_afronden();
  return jsonb_build_object('gesprekken', coalesce((select jsonb_agg(private.chat_gesprek_json(g, v_id) order by g.laatst desc)
    from private.chat_gesprekken g join private.chat_leden l on l.gesprek = g.id
    where l.gebruiker = v_id and l.status in ('lid', 'verzoek') and g.community is null), '[]'::jsonb),
    'communities', coalesce((select jsonb_agg(private.chat_community_json(c, v_id) order by c.id)
    from private.chat_communities c join private.chat_community_leden m on m.community = c.id
    where m.gebruiker = v_id and m.status in ('lid', 'uitgenodigd') and not c.weg), '[]'::jsonb));
end; $$;

-- Een einddatum zetten of weghalen (eigenaar en beheerders). Hooguit een jaar vooruit.
create or replace function public.community_tijdelijk(p_naam text, p_wachtwoord text, p_community bigint,
    p_eindigt timestamptz, p_na_afloop text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_rol text;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  v_rol := private.chat_community_rol(v_id, p_community);
  if v_rol is null or v_rol = 'lid' then return jsonb_build_object('fout', 'Alleen beheerders kunnen dit.'); end if;
  if p_na_afloop not in ('herinnering', 'opheffen') then return jsonb_build_object('fout', 'Kies wat er daarna gebeurt.'); end if;
  if p_na_afloop = 'opheffen' and v_rol <> 'eigenaar' then
    return jsonb_build_object('fout', 'Alleen de eigenaar kan kiezen voor opheffen.');
  end if;
  if p_eindigt is not null and (p_eindigt < now() + interval '10 minutes' or p_eindigt > now() + interval '366 days') then
    return jsonb_build_object('fout', 'Kies een moment tussen nu en een jaar vooruit.');
  end if;
  update private.chat_communities set eindigt = p_eindigt, na_afloop = p_na_afloop
  where id = p_community and not weg and not herinnering;
  return jsonb_build_object('ok', true);
end; $$;

-- De hele community een herinnering maken (alleen-lezen voor iedereen) of weer openen. Alleen de eigenaar.
create or replace function public.community_herinnering(p_naam text, p_wachtwoord text, p_community bigint, p_aan boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if private.chat_community_rol(v_id, p_community) is distinct from 'eigenaar' then
    return jsonb_build_object('fout', 'Alleen de eigenaar kan dit.');
  end if;
  update private.chat_communities set herinnering = coalesce(p_aan, false),
    herinnering_sinds = case when coalesce(p_aan, false) then now() else null end,
    eindigt = case when coalesce(p_aan, false) then eindigt else null end,
    code_aan = case when coalesce(p_aan, false) then false else code_aan end
  where id = p_community and not weg;
  return jsonb_build_object('ok', true);
end; $$;

-- Voor jezelf bewaren (uit je lijst, onder Bewaard) of terugzetten. Iedereen die lid is.
create or replace function public.community_bewaren(p_naam text, p_wachtwoord text, p_community bigint, p_aan boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  update private.chat_community_leden set bewaard = coalesce(p_aan, false)
  where community = p_community and gebruiker = v_id and status = 'lid';
  if not found then return jsonb_build_object('fout', 'Je bent geen lid van deze community.'); end if;
  return jsonb_build_object('ok', true);
end; $$;

-- Schrijven in een herinnering kan niet meer; verder ongewijzigd.
create or replace function public.chat_versturen(p_naam text, p_wachtwoord text, p_gesprek bigint, p_apparaat bigint,
    p_inhoud text, p_iv text, p_epk jsonb, p_sleutels jsonb, p_handtekening text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); g private.chat_gesprekken; v_nieuw bigint;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into g from private.chat_gesprekken where id = p_gesprek and not weg;
  if not found or private.chat_lid(v_id, p_gesprek) is distinct from 'lid' then return jsonb_build_object('fout', 'Geen toegang.'); end if;
  if g.community is not null and exists (select 1 from private.chat_communities c where c.id = g.community and c.herinnering) then
    return jsonb_build_object('fout', 'Deze community is een herinnering. Je kunt alles teruglezen, maar niet meer schrijven.');
  end if;
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

create or replace function public.community_post_plaatsen(p_naam text, p_wachtwoord text, p_community bigint, p_tekst text, p_foto text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_post bigint;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if private.chat_community_rol(v_id, p_community) is null then
    return jsonb_build_object('fout', 'Je kunt alleen posten in een community waar je lid van bent.');
  end if;
  if exists (select 1 from private.chat_communities c where c.id = p_community and c.herinnering) then
    return jsonb_build_object('fout', 'Deze community is een herinnering. Posten kan niet meer.');
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

revoke all on function private.community_opheffen(bigint), private.communities_afronden() from public, anon, authenticated;
revoke all on function public.community_tijdelijk(text, text, bigint, timestamptz, text), public.community_herinnering(text, text, bigint, boolean),
  public.community_bewaren(text, text, bigint, boolean) from public;
grant execute on function public.community_tijdelijk(text, text, bigint, timestamptz, text), public.community_herinnering(text, text, bigint, boolean),
  public.community_bewaren(text, text, bigint, boolean) to anon, authenticated;
