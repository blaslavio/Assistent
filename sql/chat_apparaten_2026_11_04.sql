-- 4 november 2026: de chat liep vast op "al 10 apparaten". Nu vervalt het oudste apparaat vanzelf.
-- Plak dit hele bestand in de Supabase SQL-editor en tik op Run.

-- Een apparaat meldt zijn openbare sleutels aan (de geheime sleutels blijven op het apparaat).
create or replace function public.chat_apparaat_aanmelden(p_naam text, p_wachtwoord text, p_apparaat text,
                                                         p_ecdh jsonb, p_teken jsonb, p_vingerafdruk text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_nieuw bigint;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if coalesce(p_ecdh ->> 'kty', '') <> 'EC' or coalesce(p_teken ->> 'kty', '') <> 'EC' or p_ecdh ? 'd' or p_teken ? 'd'
     or coalesce(p_vingerafdruk, '') !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('fout', 'Ongeldige sleutel.');
  end if;
  -- Hooguit 10 apparaten tegelijk. Bij een nieuw apparaat vervalt het apparaat dat het langst niet gebruikt is,
  -- net als bij ingelogd blijven. Zo loopt de chat nooit vast op oude apparaten.
  update private.chat_apparaten set weg = true
  where id in (select id from private.chat_apparaten where gebruiker = v_id and not weg
               order by coalesce(laatst, aangemaakt) asc
               offset 0 limit greatest(0, (select count(*) from private.chat_apparaten where gebruiker = v_id and not weg) - 9));
  insert into private.chat_apparaten (gebruiker, naam, ecdh, teken, vingerafdruk)
  values (v_id, left(coalesce(p_apparaat, ''), 60),
          jsonb_build_object('kty', 'EC', 'crv', p_ecdh ->> 'crv', 'x', p_ecdh ->> 'x', 'y', p_ecdh ->> 'y'),
          jsonb_build_object('kty', 'EC', 'crv', p_teken ->> 'crv', 'x', p_teken ->> 'x', 'y', p_teken ->> 'y'),
          p_vingerafdruk)
  returning id into v_nieuw;
  return jsonb_build_object('ok', true, 'id', v_nieuw, 'gebruiker', v_id, 'naam', private.weergave(v_id));
end; $$;

