-- Oude toegang uit de eerste versie dicht, en een dagelijkse opruimtaak voor logregels ouder dan 90 dagen.
-- Gekozen door de eigenaar op 29 oktober 2026. Terugdraaien kan met grant execute ... to anon.
-- Stand: het dichtzetten staat in prod (migratie oude_toegang_dicht). De opruimtaak nog niet: de databasekoppeling
-- laat geen migratie met delete toe, dus die moet via de SQL-editor van Supabase.

revoke execute on function public.lees(text), public.bewaar(text, jsonb),
  public.lees_gegevens(text), public.bewaar_gegevens(text, jsonb) from public, anon, authenticated;

-- Alleen logboeken: inlogpogingen, inlog-geschiedenis, codepogingen en verstuurde of vervallen meldingen.
-- Gebruikersgegevens blijven altijd staan.
create or replace function private.logs_opruimen()
returns void language plpgsql security definer set search_path to '' as $$
declare v_grens timestamptz := now() - interval '90 days';
begin
  delete from private.pogingen where tijd < v_grens;
  delete from private.chat_code_pogingen where tijd < v_grens;
  delete from private.inlogs where tijd < v_grens;
  delete from private.push_wachtrij where wanneer < v_grens and (verstuurd is not null or geannuleerd);
  delete from cron.job_run_details where end_time < now() - interval '14 days';
end; $$;
revoke all on function private.logs_opruimen() from public, anon, authenticated;

select cron.schedule('logs-opruimen', '17 3 * * *', 'select private.logs_opruimen()');
