-- Voor uitrol van de nieuwe appversie uitvoeren in Supabase SQL Editor.
-- Bestaande gegevens blijven behouden. Alle appservers moeten deze versie gebruiken:
-- Tijdens uitrol kunnen oude clients niet meer opslaan; werk alle appservers bij.
begin;

create or replace function public.mijn_gegevens_veilig_bewaren(
  p_naam text, p_wachtwoord text, p_basis jsonb, p_data jsonb
) returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
  v_data jsonb;
  v_leeg constant jsonb := '{"taken":[],"afspraken":[],"contacten":[],"leerdoelen":[],"sportdoelen":[],"volgend_id":1}';
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if jsonb_typeof(p_basis) is distinct from 'object' or jsonb_typeof(p_data) is distinct from 'object' then
    raise exception 'Gegevens moeten JSON-objecten zijn' using errcode = '22023';
  end if;
  insert into public.gegevens(id, data) values (v_id, '{}'::jsonb) on conflict (id) do nothing;
  select data into v_data from public.gegevens where id = v_id for update;
  -- Vergelijk onder hetzelfde rijslot als de update. Ook een nieuw ontvangstbewijs
  -- verandert de basis: dezelfde opdracht kan dus niet tweemaal worden toegevoegd.
  if (v_leeg || coalesce(v_data, '{}'::jsonb)) is distinct from p_basis then
    return jsonb_build_object('conflict', true);
  end if;
  update public.gegevens set data = p_data where id = v_id;
  return jsonb_build_object('ok', true);
end; $$;

revoke all on function public.mijn_gegevens_veilig_bewaren(text, text, jsonb, jsonb) from public;
grant execute on function public.mijn_gegevens_veilig_bewaren(text, text, jsonb, jsonb) to anon, authenticated;
-- Sluit ook het oude schrijfpad af: een achtergebleven appserver mag geen
-- nieuwere afspraken of ontvangstbewijzen met een verouderde kopie overschrijven.
revoke execute on function public.mijn_gegevens_bewaren(text, text, jsonb) from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;
