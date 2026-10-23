-- VR-ruimtes v2: zelf een wereld of spel bouwen. De bouwer slaat de hele wereld op als één JSON (private.ruimtes.bouw):
-- omgeving, spelregels en alle dingen met plek, draaiing, maat, kleur en gedrag. Foto's en 3D-modellen blijven in
-- private.ruimte_items staan; de wereld verwijst ernaar met hun nummer. Spelers bewaren hun beste score.
-- Alleen toevoegen, niets weggooien: oude ruimtes zonder bouw werken zoals voorheen.

alter table private.ruimtes add column if not exists bouw jsonb;
alter table private.ruimtes add column if not exists omslag text;  -- klein plaatje (jpeg, base64) uit de bouwer
alter table private.ruimtes add column if not exists spel boolean not null default false;

create table if not exists private.ruimte_scores (
  ruimte_id bigint not null references private.ruimtes(id),
  gebruiker_id bigint not null references private.gebruikers(id),
  punten integer not null default 0,
  tijd_ms integer not null default 0,
  pogingen integer not null default 1,
  bijgewerkt timestamptz not null default now(),
  primary key (ruimte_id, gebruiker_id)
);
alter table private.ruimte_scores enable row level security;

-- Een verwijderde ruimte houdt geen wereld of plaatje over (ook bij account verwijderen).
create or replace function private.ruimte_leegmaken()
returns trigger language plpgsql set search_path to '' as $$
begin
  if new.weg then
    new.bouw := null;
    new.omslag := null;
    new.spel := false;
  end if;
  return new;
end; $$;
create or replace trigger ruimte_leegmaken before update on private.ruimtes for each row execute function private.ruimte_leegmaken();

create or replace function private.ruimte_json(r private.ruimtes)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object(
    'id', r.id, 'titel', r.titel, 'omschrijving', r.omschrijving, 'thema', r.thema, 'kleur', r.kleur,
    'openbaar', r.openbaar, 'verborgen', r.verborgen, 'bezoeken', r.bezoeken, 'bijgewerkt', r.bijgewerkt,
    'maker', private.weergave(r.gebruiker_id), 'maker_id', r.gebruiker_id,
    'gebouwd', r.bouw is not null, 'spel', r.spel,
    'items', (select count(*) from private.ruimte_items i where i.ruimte_id = r.id and not i.weg),
    'dingen_in_wereld', coalesce(jsonb_array_length(r.bouw->'dingen'), 0),
    'omslag', coalesce(r.omslag, (select i.klein from private.ruimte_items i where i.ruimte_id = r.id and i.soort = 'foto'
                                  and not i.weg order by i.volgorde, i.id limit 1)))
$$;

create or replace function public.ruimtes_zoeken(p_zoekterm text)
returns jsonb language sql stable security definer set search_path to '' as $$
  select coalesce(jsonb_agg(x order by (x->>'bijgewerkt') desc), '[]'::jsonb) from (
    select private.ruimte_json(r) as x
    from private.ruimtes r join private.gebruikers g on g.id = r.gebruiker_id
    where r.openbaar and not r.verborgen and not r.weg and not g.geblokkeerd and not g.verwijderd
      and (r.bouw is not null or exists (select 1 from private.ruimte_items i where i.ruimte_id = r.id and not i.weg))
      and (coalesce(trim(p_zoekterm), '') = '' or r.titel ilike '%' || trim(p_zoekterm) || '%'
           or r.omschrijving ilike '%' || trim(p_zoekterm) || '%')
    limit 100) s
$$;

create or replace function public.ruimte_bekijken(p_naam text, p_wachtwoord text, p_id bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := case when coalesce(p_wachtwoord, '') = '' then null
                            else private.gebruiker_id(p_naam, p_wachtwoord) end;
        r private.ruimtes;
begin
  select * into r from private.ruimtes where id = p_id and not weg;
  if r.id is null or (r.gebruiker_id is distinct from v_id and (not r.openbaar or r.verborgen
      or exists (select 1 from private.gebruikers where id = r.gebruiker_id and (geblokkeerd or verwijderd)))) then
    return jsonb_build_object('fout', 'Deze ruimte bestaat niet of is niet openbaar.');
  end if;
  if r.gebruiker_id is distinct from v_id then
    update private.ruimtes set bezoeken = bezoeken + 1 where id = r.id;
  end if;
  return private.ruimte_json(r) || jsonb_build_object(
    'van_mij', r.gebruiker_id = v_id, 'bouw', r.bouw,
    'dingen', coalesce((select jsonb_agg(jsonb_build_object(
        'id', i.id, 'soort', i.soort, 'titel', i.titel, 'tekst', i.tekst, 'data', i.data,
        'breedte', i.breedte, 'hoogte', i.hoogte) order by i.volgorde, i.id)
      from private.ruimte_items i where i.ruimte_id = r.id and not i.weg), '[]'::jsonb));
end; $$;

-- De bouwer: de hele wereld in één keer opslaan. Hooguit 800 dingen en 600 kB.
create or replace function public.ruimte_bouw_opslaan(p_naam text, p_wachtwoord text, p_id bigint, p_bouw jsonb,
                                                      p_omslag text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_spel boolean;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if p_bouw is null or jsonb_typeof(p_bouw) <> 'object' or jsonb_typeof(p_bouw->'dingen') <> 'array' then
    return jsonb_build_object('fout', 'Deze wereld kan niet worden opgeslagen.');
  end if;
  if jsonb_array_length(p_bouw->'dingen') > 800 then
    return jsonb_build_object('fout', 'Een wereld kan hooguit 800 dingen hebben.');
  end if;
  if length(p_bouw::text) > 600000 then
    return jsonb_build_object('fout', 'Deze wereld is te groot om op te slaan.');
  end if;
  if p_omslag is not null and (length(p_omslag) > 120000 or p_omslag !~ '^[A-Za-z0-9+/=]*$') then
    p_omslag := null;
  end if;
  v_spel := coalesce(p_bouw->'spel'->>'soort', 'geen') <> 'geen';
  update private.ruimtes set bouw = p_bouw, omslag = coalesce(p_omslag, omslag), spel = v_spel, bijgewerkt = now()
  where id = p_id and gebruiker_id = v_id and not weg;
  if not found then return jsonb_build_object('fout', 'Ruimte niet gevonden.'); end if;
  return jsonb_build_object('ok', true, 'bijgewerkt', now());
end; $$;

-- Een openbare wereld (of je eigen) kopiëren om zelf verder te bouwen. Foto's en 3D-modellen van een ander gaan niet mee.
create or replace function public.ruimte_kopie(p_naam text, p_wachtwoord text, p_id bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); r private.ruimtes; v_nieuw bigint; v_bouw jsonb;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into r from private.ruimtes where id = p_id and not weg and bouw is not null;
  if r.id is null or (r.gebruiker_id <> v_id and (not r.openbaar or r.verborgen)) then
    return jsonb_build_object('fout', 'Deze wereld kun je niet kopiëren.');
  end if;
  if (select count(*) from private.ruimtes where gebruiker_id = v_id and not weg) >= 20 then
    return jsonb_build_object('fout', 'Je kunt maximaal 20 ruimtes hebben.');
  end if;
  v_bouw := jsonb_set(r.bouw, '{dingen}', coalesce((select jsonb_agg(d) from jsonb_array_elements(r.bouw->'dingen') d
                                                    where coalesce(d->>'v', '') not in ('foto', 'model')), '[]'::jsonb));
  insert into private.ruimtes (gebruiker_id, titel, omschrijving, thema, kleur, openbaar, bouw, omslag, spel)
  values (v_id, left('Kopie van ' || r.titel, 80), r.omschrijving, r.thema, r.kleur, false, v_bouw, r.omslag, r.spel)
  returning id into v_nieuw;
  return jsonb_build_object('ok', true, 'id', v_nieuw);
end; $$;

-- Scores: per speler de beste (meeste punten, dan snelste tijd). Alleen voor openbare of eigen spellen.
create or replace function private.ruimte_toplijst(p_ruimte bigint)
returns jsonb language sql stable security definer set search_path to '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('naam', private.weergave(s.gebruiker_id), 'punten', s.punten,
                                               'tijd_ms', s.tijd_ms) order by s.punten desc, s.tijd_ms), '[]'::jsonb)
  from (select s.* from private.ruimte_scores s join private.gebruikers g on g.id = s.gebruiker_id
        where s.ruimte_id = p_ruimte and not g.geblokkeerd and not g.verwijderd
        order by s.punten desc, s.tijd_ms limit 10) s
$$;

create or replace function public.ruimte_score(p_naam text, p_wachtwoord text, p_id bigint, p_punten integer,
                                               p_tijd_ms integer)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); r private.ruimtes;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into r from private.ruimtes where id = p_id and not weg and spel;
  if r.id is null or (r.gebruiker_id <> v_id and (not r.openbaar or r.verborgen)) then
    return jsonb_build_object('fout', 'Dit spel bestaat niet.');
  end if;
  p_punten := greatest(0, least(coalesce(p_punten, 0), 100000));
  p_tijd_ms := greatest(0, least(coalesce(p_tijd_ms, 0), 86400000));
  insert into private.ruimte_scores as s (ruimte_id, gebruiker_id, punten, tijd_ms)
  values (p_id, v_id, p_punten, p_tijd_ms)
  on conflict (ruimte_id, gebruiker_id) do update
    set pogingen = s.pogingen + 1, bijgewerkt = now(),
        punten = case when excluded.punten > s.punten or (excluded.punten = s.punten and excluded.tijd_ms < s.tijd_ms)
                      then excluded.punten else s.punten end,
        tijd_ms = case when excluded.punten > s.punten or (excluded.punten = s.punten and excluded.tijd_ms < s.tijd_ms)
                       then excluded.tijd_ms else s.tijd_ms end;
  return jsonb_build_object('ok', true, 'toplijst', private.ruimte_toplijst(p_id));
end; $$;

create or replace function public.ruimte_scores(p_id bigint)
returns jsonb language sql stable security definer set search_path to '' as $$
  select case when exists (select 1 from private.ruimtes where id = p_id and not weg and spel and openbaar and not verborgen)
              then private.ruimte_toplijst(p_id) else '[]'::jsonb end
$$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function public.ruimte_bouw_opslaan(text, text, bigint, jsonb, text), public.ruimte_kopie(text, text, bigint),
  public.ruimte_score(text, text, bigint, integer, integer), public.ruimte_scores(bigint),
  public.ruimtes_zoeken(text), public.ruimte_bekijken(text, text, bigint) from public;
grant execute on function public.ruimte_bouw_opslaan(text, text, bigint, jsonb, text), public.ruimte_kopie(text, text, bigint),
  public.ruimte_score(text, text, bigint, integer, integer), public.ruimte_scores(bigint),
  public.ruimtes_zoeken(text), public.ruimte_bekijken(text, text, bigint) to anon, authenticated;
