-- Foutmeldingen uit de app. Als een scherm vastloopt, stuurt de app de fout (zonder gegevens) hierheen. We bewaren
-- niets in een tabel: de melding komt alleen in het serverlogboek, zodat we kunnen zien wat er misging.
create or replace function public.app_fout_melden(p_tekst text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise warning 'app_fout: %', left(coalesce(p_tekst, ''), 2000);
end;
$$;

revoke all on function public.app_fout_melden(text) from public;
grant execute on function public.app_fout_melden(text) to anon, authenticated;
