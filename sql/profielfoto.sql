-- Profielfoto. Een kleine foto (de app verkleint hem tot 128 bij 128) die anderen in de chat bij je naam zien.
-- Jij kiest wie hem ziet: iedereen, alleen je contacten (standaard) of niemand.

alter table private.gebruikers add column if not exists foto text
  check (foto is null or (foto like 'data:image/jpeg;base64,%' and length(foto) <= 60000));
alter table private.gebruikers add column if not exists foto_zichtbaar text not null default 'contacten'
  check (foto_zichtbaar in ('iedereen', 'contacten', 'niemand'));

-- p_foto: null = niet veranderen, '' = weghalen.
create or replace function public.profielfoto_instellen(p_naam text, p_wachtwoord text, p_foto text, p_zichtbaar text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if p_zichtbaar is not null and p_zichtbaar not in ('iedereen', 'contacten', 'niemand') then
    return jsonb_build_object('fout', 'Kies wie je foto ziet.');
  end if;
  if p_foto is not null and p_foto <> '' and (p_foto not like 'data:image/jpeg;base64,%' or length(p_foto) > 60000) then
    return jsonb_build_object('fout', 'Deze foto is te groot. Kies een andere.');
  end if;
  update private.gebruikers set foto = case when p_foto is null then foto else nullif(p_foto, '') end,
    foto_zichtbaar = coalesce(p_zichtbaar, foto_zichtbaar)
  where id = v_id;
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.profielfoto_instellen(text, text, text, text) to anon, authenticated;

-- Foto's voor de chat: alleen van wie jou dat toestaat (iedereen, of jij staat in zijn contacten).
create or replace function public.chat_fotos(p_naam text, p_wachtwoord text, p_ids bigint[])
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object('fotos', coalesce((
    select jsonb_object_agg(g.id::text, g.foto) from private.gebruikers g
    where g.id = any((coalesce(p_ids, '{}'))[1:200]) and g.foto is not null and not g.verwijderd and not g.geblokkeerd
      and (g.id = v_id or g.foto_zichtbaar = 'iedereen'
           or (g.foto_zichtbaar = 'contacten' and private.chat_is_contact(g.id, v_id)))), '{}'::jsonb));
end; $$;
grant execute on function public.chat_fotos(text, text, bigint[]) to anon, authenticated;

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
                                            'heeft_foto', foto is not null, 'foto_zichtbaar', foto_zichtbaar)
                  from private.gebruikers where id = v_id));
end; $$;

-- Een verwijderd account houdt geen nummer en geen foto.
create or replace function private.telefoon_bij_verwijderen()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.verwijderd and not old.verwijderd then
    new.telefoon_hash := null; new.telefoon_eind := null; new.telefoon_vindbaar := false; new.foto := null;
  end if;
  return new;
end; $$;
