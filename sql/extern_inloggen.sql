-- Inloggen met Google, Apple of Microsoft (Supabase Auth). De app stuurt je naar de aanbieder; daarna wisselt de
-- app de code in voor een Supabase-sleutel en roept public.inloggen_extern aan mét die sleutel. Postgres leest dan
-- zelf wie je bent (auth.jwt()), dus de app kan niet voor iemand anders inloggen.
-- Koppelen gaat via auth_id, of de eerste keer via het (door de aanbieder bevestigde) mailadres.
-- Een account met tweestapsverificatie koppelt niet vanzelf: dan eerst met wachtwoord en code inloggen.

alter table private.gebruikers add column if not exists auth_id uuid;
create unique index if not exists gebruikers_auth_id on private.gebruikers (auth_id) where auth_id is not null;

create or replace function public.inloggen_extern(p_apparaat text, p_akkoord boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_jwt jsonb := coalesce(auth.jwt(), '{}'::jsonb);
  v_uid uuid := auth.uid();
  v_aanbieder text := v_jwt -> 'app_metadata' ->> 'provider';
  v_email text := lower(trim(coalesce(v_jwt ->> 'email', '')));
  v_meta jsonb := coalesce(v_jwt -> 'user_metadata', '{}'::jsonb);
  v_naam text;
  v_basis text;
  g private.gebruikers;
begin
  if v_uid is null or v_aanbieder not in ('google', 'apple', 'azure') then
    return jsonb_build_object('fout', 'Inloggen lukte niet. Probeer het opnieuw.');
  end if;
  select * into g from private.gebruikers where auth_id = v_uid;
  if g.id is null and v_email <> '' and coalesce((v_meta ->> 'email_verified')::boolean, true) then
    select * into g from private.gebruikers where lower(email) = v_email order by id limit 1;
    if g.id is not null then
      if g.totp_aan then
        return jsonb_build_object('fout', 'Je account heeft tweestapsverificatie. Log in met je wachtwoord en code. '
                                          'Daarna kun je ook zo inloggen.');
      end if;
      if g.auth_id is not null then
        return jsonb_build_object('fout', 'Dit account is al gekoppeld aan een andere aanmelding.');
      end if;
      update private.gebruikers set auth_id = v_uid where id = g.id;
    end if;
  end if;
  if g.id is null then
    if not coalesce(p_akkoord, false) then
      return jsonb_build_object('fout', 'Ga akkoord met de voorwaarden en de privacyverklaring.');
    end if;
    if v_email = '' then
      return jsonb_build_object('fout', 'Je mailadres kwam niet mee. Maak een account met je mailadres.');
    end if;
    if (select count(*) from private.gebruikers where aangemaakt > now() - interval '1 hour') >= 30 then
      return jsonb_build_object('fout', 'Het is even te druk. Probeer het over een uur opnieuw.');
    end if;
    v_basis := left(regexp_replace(split_part(v_email, '@', 1), '[^a-z0-9_.-]', '', 'g'), 24);
    if length(v_basis) < 3 then v_basis := 'lid' || v_basis; end if;
    v_naam := v_basis;
    while exists (select 1 from private.gebruikers where naam = v_naam) loop
      v_naam := v_basis || (100 + floor(random() * 9900))::int;
    end loop;
    insert into private.gebruikers (naam, weergavenaam, email, hash, akkoord_op, auth_id)
    values (v_naam, left(trim(coalesce(v_meta ->> 'full_name', v_meta ->> 'name', '')), 60), v_email,
            extensions.crypt(encode(extensions.gen_random_bytes(32), 'hex'), extensions.gen_salt('bf', 10)), now(), v_uid)
    returning * into g;
    insert into public.gegevens (id, data) values (g.id, '{}'::jsonb) on conflict (id) do nothing;
  end if;
  if g.geblokkeerd or g.verwijderd then
    return jsonb_build_object('fout', 'Dit account kan niet meer inloggen.');
  end if;
  insert into private.inlogs (gebruiker, apparaat, gelukt, reden) values (g.id, left(p_apparaat, 80), true, v_aanbieder);
  return jsonb_build_object('token', private.nieuwe_sessie(g.id, p_apparaat), 'naam', coalesce(g.naam, ''),
                            'nieuw', g.aangemaakt > now() - interval '1 minute');
end; $$;

revoke all on function public.inloggen_extern(text, boolean) from public, anon;
grant execute on function public.inloggen_extern(text, boolean) to authenticated;
