-- 3D-studio: zelf 3D-ontwerpen maken uit vormen (zoals een robot, raket of meubel). Een ontwerp is een lijst
-- delen ({v: vorm, p: plek, r: draaiing, s: maat, k: kleur, m: materiaal, t: tekst}). Ontwerpen zijn privé; wie er
-- een in een wereld zet, kopieert de delen in die wereld. Alleen toevoegen, niets weggooien (zacht verwijderen).

create table if not exists private.ontwerpen (
  id bigint generated always as identity primary key,
  gebruiker_id bigint not null references private.gebruikers(id),
  titel text not null default 'Mijn ontwerp',
  delen jsonb not null default '[]'::jsonb,
  omslag text,
  weg boolean not null default false,
  gemaakt timestamptz not null default now(),
  bijgewerkt timestamptz not null default now()
);
create index if not exists ontwerpen_gebruiker on private.ontwerpen (gebruiker_id) where not weg;
alter table private.ontwerpen enable row level security;

create or replace function public.mijn_ontwerpen(p_naam text, p_wachtwoord text, p_met_delen boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object('ontwerpen', coalesce((select jsonb_agg(jsonb_build_object(
      'id', o.id, 'titel', o.titel, 'omslag', o.omslag, 'bijgewerkt', o.bijgewerkt,
      'aantal', jsonb_array_length(o.delen)) || case when p_met_delen then jsonb_build_object('delen', o.delen) else '{}'::jsonb end
      order by o.bijgewerkt desc)
    from private.ontwerpen o where o.gebruiker_id = v_id and not o.weg), '[]'::jsonb));
end; $$;

create or replace function public.ontwerp_lezen(p_naam text, p_wachtwoord text, p_id bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); o private.ontwerpen;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into o from private.ontwerpen where id = p_id and gebruiker_id = v_id and not weg;
  if o.id is null then return jsonb_build_object('fout', 'Ontwerp niet gevonden.'); end if;
  return jsonb_build_object('id', o.id, 'titel', o.titel, 'delen', o.delen, 'bijgewerkt', o.bijgewerkt);
end; $$;

-- Nieuw (p_id leeg) of alleen de naam wijzigen. Hooguit 100 ontwerpen per persoon.
create or replace function public.ontwerp_maken(p_naam text, p_wachtwoord text, p_id bigint, p_titel text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_nieuw bigint;
        v_titel text := left(coalesce(nullif(trim(p_titel), ''), 'Mijn ontwerp'), 80);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if p_id is not null then
    update private.ontwerpen set titel = v_titel, bijgewerkt = now() where id = p_id and gebruiker_id = v_id and not weg;
    if not found then return jsonb_build_object('fout', 'Ontwerp niet gevonden.'); end if;
    return jsonb_build_object('ok', true, 'id', p_id);
  end if;
  if (select count(*) from private.ontwerpen where gebruiker_id = v_id and not weg) >= 100 then
    return jsonb_build_object('fout', 'Je kunt maximaal 100 ontwerpen hebben. Haal er eerst een weg.');
  end if;
  insert into private.ontwerpen (gebruiker_id, titel) values (v_id, v_titel) returning id into v_nieuw;
  return jsonb_build_object('ok', true, 'id', v_nieuw);
end; $$;

-- De studio bewaart zelf (met je sessie). Hooguit 400 delen en 300 kB.
create or replace function public.ontwerp_opslaan(p_naam text, p_wachtwoord text, p_id bigint, p_delen jsonb,
                                                  p_omslag text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if p_delen is null or jsonb_typeof(p_delen) <> 'array' then
    return jsonb_build_object('fout', 'Dit ontwerp kan niet worden opgeslagen.');
  end if;
  if jsonb_array_length(p_delen) > 400 then
    return jsonb_build_object('fout', 'Een ontwerp kan hooguit 400 delen hebben.');
  end if;
  if length(p_delen::text) > 300000 then
    return jsonb_build_object('fout', 'Dit ontwerp is te groot om op te slaan.');
  end if;
  if p_omslag is not null and (length(p_omslag) > 80000 or p_omslag !~ '^[A-Za-z0-9+/=]*$') then
    p_omslag := null;
  end if;
  update private.ontwerpen set delen = p_delen, omslag = coalesce(p_omslag, omslag), bijgewerkt = now()
  where id = p_id and gebruiker_id = v_id and not weg;
  if not found then return jsonb_build_object('fout', 'Ontwerp niet gevonden.'); end if;
  return jsonb_build_object('ok', true, 'bijgewerkt', now());
end; $$;

create or replace function public.ontwerp_kopie(p_naam text, p_wachtwoord text, p_id bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); o private.ontwerpen; v_nieuw bigint;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into o from private.ontwerpen where id = p_id and gebruiker_id = v_id and not weg;
  if o.id is null then return jsonb_build_object('fout', 'Ontwerp niet gevonden.'); end if;
  if (select count(*) from private.ontwerpen where gebruiker_id = v_id and not weg) >= 100 then
    return jsonb_build_object('fout', 'Je kunt maximaal 100 ontwerpen hebben. Haal er eerst een weg.');
  end if;
  insert into private.ontwerpen (gebruiker_id, titel, delen, omslag)
  values (v_id, left('Kopie van ' || o.titel, 80), o.delen, o.omslag) returning id into v_nieuw;
  return jsonb_build_object('ok', true, 'id', v_nieuw);
end; $$;

create or replace function public.ontwerp_weg(p_naam text, p_wachtwoord text, p_id bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  update private.ontwerpen set weg = true, delen = '[]'::jsonb, omslag = null, bijgewerkt = now()
  where id = p_id and gebruiker_id = v_id and not weg;
  return jsonb_build_object('ok', true);
end; $$;

-- Wie zijn account verwijdert, houdt geen ontwerpen over.
create or replace function private.ontwerpen_account_weg()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.verwijderd and not old.verwijderd then
    update private.ontwerpen set weg = true, delen = '[]'::jsonb, omslag = null where gebruiker_id = new.id;
  end if;
  return new;
end; $$;
create or replace trigger ontwerpen_account_weg after update of verwijderd on private.gebruikers
  for each row execute function private.ontwerpen_account_weg();

revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function public.mijn_ontwerpen(text, text, boolean), public.ontwerp_lezen(text, text, bigint),
  public.ontwerp_maken(text, text, bigint, text), public.ontwerp_opslaan(text, text, bigint, jsonb, text),
  public.ontwerp_kopie(text, text, bigint), public.ontwerp_weg(text, text, bigint) from public;
grant execute on function public.mijn_ontwerpen(text, text, boolean), public.ontwerp_lezen(text, text, bigint),
  public.ontwerp_maken(text, text, bigint, text), public.ontwerp_opslaan(text, text, bigint, jsonb, text),
  public.ontwerp_kopie(text, text, bigint), public.ontwerp_weg(text, text, bigint) to anon, authenticated;
