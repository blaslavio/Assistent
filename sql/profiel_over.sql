-- "Over mij": een korte tekst op je profiel (max. 160 tekens), zichtbaar voor wie je profiel bekijkt.
alter table private.gebruikers add column if not exists over text not null default ''
  check (length(over) <= 160);

create or replace function public.profiel_over_instellen(p_naam text, p_wachtwoord text, p_over text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
  v_over text := left(regexp_replace(trim(coalesce(p_over, '')), '\s+', ' ', 'g'), 160);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  update private.gebruikers set over = v_over where id = v_id;
  return jsonb_build_object('ok', true);
end; $$;
revoke all on function public.profiel_over_instellen(text, text, text) from public;
grant execute on function public.profiel_over_instellen(text, text, text) to anon, authenticated;

create or replace function private.openbaar_profiel(p_id bigint)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object(
    'id', g.id,
    'naam', coalesce(nullif(g.weergavenaam, ''), g.naam, ''),
    'gebruikersnaam', coalesce(g.naam, ''),
    'over', g.over,
    'winkel', (select jsonb_build_object('adres', w.adres, 'naam', w.naam, 'omschrijving', w.omschrijving, 'kleur', w.kleur)
               from private.winkels w where w.gebruiker_id = g.id and w.open),
    'boek', (select jsonb_build_object('adres', b.adres, 'titel', b.titel, 'intro', b.intro, 'soorten', b.soorten)
             from private.boekpaginas b where b.gebruiker_id = g.id and b.aan),
    'ruimtes', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'titel', r.titel) order by r.bijgewerkt desc)
                         from (select * from private.ruimtes r where r.gebruiker_id = g.id and r.openbaar and not r.verborgen
                               and not r.weg order by r.bijgewerkt desc limit 5) r), '[]'::jsonb))
  from private.gebruikers g where g.id = p_id and not g.geblokkeerd and not g.verwijderd
$$;
revoke all on function private.openbaar_profiel(bigint) from public, anon, authenticated;

create or replace function public.mijn_gegevens(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object(
    'data', (select data from public.gegevens where id = v_id),
    'gebruiker', (select jsonb_build_object('id', id, 'naam', naam, 'weergavenaam', private.weergave(id),
                                            'email', email, 'email_bevestigd', email_bevestigd, 'beheerder', id = 1,
                                            'niveau', niveau, 'bedrijf', bedrijf, 'max_aanbod', private.max_aanbod(id),
                                            'telefoon_eind', telefoon_eind, 'telefoon_vindbaar', telefoon_vindbaar,
                                            'heeft_foto', foto is not null, 'foto_zichtbaar', foto_zichtbaar, 'over', over)
                  from private.gebruikers where id = v_id));
end; $$;

-- Een verwijderd account houdt geen nummer, geen foto en geen "over mij".
create or replace function private.telefoon_bij_verwijderen()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.verwijderd and not old.verwijderd then
    new.telefoon_hash := null; new.telefoon_eind := null; new.telefoon_vindbaar := false; new.foto := null;
    new.over := '';
  end if;
  return new;
end; $$;
