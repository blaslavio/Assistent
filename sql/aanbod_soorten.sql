-- Cursus, training en dienst krijgen elk hun eigen gegevens en opmaak:
-- * cursus: lessen in je eigen tempo, met een niveau;
-- * training: op een vaste datum en tijd, online (met een link die alleen deelnemers zien) of op een plek, met
--   een maximum aantal plaatsen;
-- * dienst: een afspraak één op één (coaching, les, advies), met duur, waar, en een link om een moment te boeken.
-- Alleen toevoegen: bestaande cursussen en trainingen blijven zoals ze zijn.

alter table private.community_cursussen add column if not exists is_dienst boolean not null default false;
alter table private.community_cursussen add column if not exists details jsonb not null default '{}'::jsonb;

-- Alleen wat bij de soort hoort, met grenzen. Links alleen met https.
create or replace function private.cursus_details_schoon(p_soort text, p jsonb)
returns jsonb language plpgsql immutable set search_path to '' as $$
declare
  v jsonb := '{}'::jsonb;
  v_link text := trim(coalesce(p->>'link', ''));
  v_boek text := trim(coalesce(p->>'boeklink', ''));
  v_duur int;
  v_plaatsen int;
begin
  if jsonb_typeof(p) is distinct from 'object' then return v; end if;
  if v_link !~ '^https://[^\s<>"]+$' or length(v_link) > 300 then v_link := ''; end if;
  if v_boek !~ '^https://[^\s<>"]+$' or length(v_boek) > 300 then v_boek := ''; end if;
  begin v_duur := least(greatest((p->>'duur')::int, 0), 1440); exception when others then v_duur := 0; end;
  begin v_plaatsen := least(greatest((p->>'plaatsen')::int, 0), 10000); exception when others then v_plaatsen := 0; end;
  if p_soort = 'cursus' then
    v := jsonb_build_object('niveau', case when p->>'niveau' in ('beginner', 'gevorderd', 'iedereen') then p->>'niveau' else '' end);
  else
    v := jsonb_build_object('duur', coalesce(v_duur, 0),
      'waar', case when p->>'waar' in ('online', 'locatie') then p->>'waar' else 'online' end,
      'plek', left(trim(coalesce(p->>'plek', '')), 200), 'link', v_link);
    if p_soort = 'training' then
      v := v || jsonb_build_object('plaatsen', coalesce(v_plaatsen, 0),
        'wanneer', case when coalesce(p->>'wanneer', '') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$' then p->>'wanneer' else '' end);
    else
      v := v || jsonb_build_object('boeklink', v_boek);
    end if;
  end if;
  return v;
end; $$;

create or replace function private.cursus_soort(c private.community_cursussen)
returns text language sql immutable set search_path to '' as $$
  select case when c.is_dienst then 'dienst' else c.soort end
$$;

-- De link om online mee te doen zien alleen deelnemers (en de eigenaar).
create or replace function private.cursus_json(c private.community_cursussen, p_ik bigint)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('id', c.id, 'community', c.community, 'titel', c.titel, 'omschrijving', c.omschrijving,
    'soort', private.cursus_soort(c), 'prijs_cent', c.prijs_cent, 'voor_abonnees', c.voor_abonnees, 'gepubliceerd', c.gepubliceerd,
    'details', case when private.cursus_mag_lezen(p_ik, c) then c.details else c.details - 'link' end,
    'toegang', private.cursus_mag_lezen(p_ik, c),
    'gekocht', exists (select 1 from private.cursus_toegang t where t.cursus = c.id and t.gebruiker = p_ik),
    'lessen', (select count(*) from private.cursus_lessen l where l.cursus = c.id and not l.weg),
    'minuten', (select coalesce(sum(l.minuten), 0) from private.cursus_lessen l where l.cursus = c.id and not l.weg),
    'klaar', (select count(*) from private.cursus_voortgang v join private.cursus_lessen l on l.id = v.les
              where v.gebruiker = p_ik and v.klaar and l.cursus = c.id and not l.weg),
    'deelnemers', (select count(*) from private.cursus_toegang t where t.cursus = c.id),
    'kopers', case when private.cursus_beheer(p_ik, c.community)
                   then (select count(*) from private.cursus_toegang t where t.cursus = c.id and t.bron = 'gekocht') end)
$$;

-- Opslaan met soort (cursus, training of dienst) en de gegevens die erbij horen.
create or replace function public.cursus_opslaan(p_naam text, p_wachtwoord text, p_community bigint, p_cursus bigint,
                                                 p_titel text, p_omschrijving text, p_prijs_cent integer,
                                                 p_voor_abonnees boolean, p_gepubliceerd boolean, p_soort text,
                                                 p_details jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare r jsonb; v_soort text := coalesce(p_soort, 'cursus');
begin
  if v_soort not in ('cursus', 'training', 'dienst') then
    return jsonb_build_object('fout', 'Kies cursus, training of dienst.');
  end if;
  r := public.cursus_opslaan(p_naam, p_wachtwoord, p_community, p_cursus, p_titel, p_omschrijving, p_prijs_cent,
                             p_voor_abonnees, p_gepubliceerd, case when v_soort = 'dienst' then 'cursus' else v_soort end);
  if (r ->> 'id') is not null then
    update private.community_cursussen set is_dienst = (v_soort = 'dienst'),
      details = private.cursus_details_schoon(v_soort, p_details)
    where id = (r ->> 'id')::bigint;
  end if;
  return r;
end; $$;

revoke all on function private.cursus_details_schoon(text, jsonb) from public, anon, authenticated;
revoke all on function private.cursus_soort(private.community_cursussen) from public, anon, authenticated;
grant execute on function public.cursus_opslaan(text, text, bigint, bigint, text, text, integer, boolean, boolean, text, jsonb)
  to anon, authenticated;
