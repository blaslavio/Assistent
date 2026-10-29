-- Een openbare profielpagina met een eigen link (?profiel=adres), zoals een visitekaartje: je naam, een zin over
-- jezelf, je links, en wat je openbaar aanbiedt (winkel, boekpagina, openbare community's, cursussen, berichten,
-- spullen op de marktplaats). Standaard uit: alleen wie hem zelf aanzet, heeft er een. Je gebruikersnaam (waarmee je
-- inlogt) staat er niet op; het adres kies je los. Alleen toevoegen.

create table if not exists private.profielpaginas (
  gebruiker_id bigint primary key references private.gebruikers(id),
  adres text not null unique check (adres ~ '^[a-z0-9][a-z0-9-]{2,29}$'),
  aan boolean not null default false,
  kop text not null default '' check (length(kop) <= 80),
  links jsonb not null default '[]'::jsonb,
  bijgewerkt timestamptz not null default now()
);
alter table private.profielpaginas enable row level security;

create or replace function public.mijn_profielpagina(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object('pagina', (select jsonb_build_object('adres', p.adres, 'aan', p.aan, 'kop', p.kop, 'links', p.links)
    from private.profielpaginas p where p.gebruiker_id = v_id));
end; $$;

create or replace function public.profielpagina_instellen(p_naam text, p_wachtwoord text, p_adres text, p_aan boolean,
                                                          p_kop text, p_links jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_adres text := lower(trim(coalesce(p_adres, '')));
  v_links jsonb := '[]'::jsonb; x jsonb;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if v_adres !~ '^[a-z0-9][a-z0-9-]{2,29}$' then
    return jsonb_build_object('fout', 'Kies een adres van 3 tot 30 tekens: kleine letters, cijfers en streepjes.');
  end if;
  if exists (select 1 from private.profielpaginas where adres = v_adres and gebruiker_id <> v_id) then
    return jsonb_build_object('fout', 'Dit adres is al bezet. Kies een ander.');
  end if;
  if jsonb_typeof(p_links) = 'array' then
    for x in select * from jsonb_array_elements(p_links) limit 6 loop
      if coalesce(x->>'url', '') ~ '^https://[^\s<>"]+$' and length(x->>'url') <= 300 then
        v_links := v_links || jsonb_build_array(jsonb_build_object('label',
          left(coalesce(nullif(trim(x->>'label'), ''), x->>'url'), 40), 'url', x->>'url'));
      end if;
    end loop;
  end if;
  insert into private.profielpaginas (gebruiker_id, adres, aan, kop, links)
  values (v_id, v_adres, coalesce(p_aan, false), left(trim(coalesce(p_kop, '')), 80), v_links)
  on conflict (gebruiker_id) do update set adres = excluded.adres, aan = excluded.aan, kop = excluded.kop,
    links = excluded.links, bijgewerkt = now();
  return jsonb_build_object('ok', true, 'adres', v_adres);
end; $$;

-- De pagina zelf. Ook zonder account te bekijken; alleen wat de eigenaar toch al openbaar maakte.
create or replace function public.profiel_bekijken(p_adres text)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare p private.profielpaginas; g private.gebruikers;
begin
  select * into p from private.profielpaginas where adres = lower(trim(coalesce(p_adres, ''))) and aan;
  if p.gebruiker_id is not null then select * into g from private.gebruikers where id = p.gebruiker_id; end if;
  if p.gebruiker_id is null or g.geblokkeerd or g.verwijderd then
    return jsonb_build_object('fout', 'Deze pagina bestaat niet of staat uit.');
  end if;
  return jsonb_build_object(
    'adres', p.adres, 'naam', private.weergave(g.id), 'kop', p.kop, 'over', g.over, 'links', p.links,
    'foto', case when g.foto_zichtbaar = 'iedereen' then g.foto end,
    'winkel', (select jsonb_build_object('adres', w.adres, 'naam', w.naam, 'omschrijving', w.omschrijving, 'kleur', w.kleur)
               from private.winkels w where w.gebruiker_id = g.id and w.open),
    'boek', (select jsonb_build_object('adres', b.adres, 'titel', b.titel, 'intro', b.intro)
             from private.boekpaginas b where b.gebruiker_id = g.id and b.aan),
    'communities', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'naam', c.naam, 'omschrijving', c.omschrijving,
        'leden', (select count(*) from private.chat_community_leden l where l.community = c.id and l.status = 'lid')) order by c.id)
      from private.chat_communities c join private.chat_community_leden m on m.community = c.id
      where m.gebruiker = g.id and m.rol = 'eigenaar' and m.status = 'lid' and c.openbaar and not c.weg), '[]'::jsonb),
    'aanbod', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'titel', c.titel, 'soort', private.cursus_soort(c),
        'prijs_cent', c.prijs_cent, 'details', c.details - 'link') order by c.id desc)
      from (select k.* from private.community_cursussen k join private.chat_communities c on c.id = k.community
            where k.maker = g.id and k.gepubliceerd and not k.weg and c.openbaar and not c.weg
            order by k.id desc limit 6) c), '[]'::jsonb),
    'posts', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'tekst', left(x.tekst, 300), 'aangemaakt', x.aangemaakt,
        'community_naam', x.naam) order by x.aangemaakt desc)
      from (select q.id, q.tekst, q.aangemaakt, c.naam from private.community_posts q join private.chat_communities c on c.id = q.community
            where q.auteur = g.id and not q.weg and c.openbaar and not c.weg order by q.aangemaakt desc limit 5) x), '[]'::jsonb),
    'spullen', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'titel', a.titel, 'prijs', a.prijs,
        'heeft_foto', private.heeft_foto(a.id)) order by a.aangemaakt desc)
      from (select * from private.aanbod a where a.gebruiker_id = g.id and a.actief and not a.geblokkeerd and not a.in_winkel
            order by a.aangemaakt desc limit 6) a), '[]'::jsonb));
end; $$;

-- Verwijdert iemand zijn account, dan gaat zijn pagina uit en worden de links gewist.
create or replace function private.profielpagina_wissen()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  update private.profielpaginas set aan = false, kop = '', links = '[]'::jsonb where gebruiker_id = new.id;
  return new;
end; $$;

create or replace trigger profielpagina_wissen after update of verwijderd on private.gebruikers
  for each row when (new.verwijderd and not old.verwijderd) execute function private.profielpagina_wissen();

revoke all on function private.profielpagina_wissen() from public, anon, authenticated;
grant execute on function public.mijn_profielpagina(text, text) to anon, authenticated;
grant execute on function public.profielpagina_instellen(text, text, text, boolean, text, jsonb) to anon, authenticated;
grant execute on function public.profiel_bekijken(text) to anon, authenticated;
