-- Centrale AI-sleutels in Vault. Alleen de betaalde serverroute leest de waarden.
create or replace function private.ai_platform_sleutel(p_provider text)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select decrypted_secret from vault.decrypted_secrets
      where name = case p_provider when 'openai' then 'superapp_openai_api_key'
                                   when 'anthropic' then 'superapp_anthropic_api_key' end limit 1),
    case when p_provider = 'anthropic' then (select anthropic_sleutel from private.platform where id=1) end, '')
$$;
revoke all on function private.ai_platform_sleutel(text) from public, anon, authenticated;

create or replace function public.ai_toegang(p_gebruiker bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_budget numeric := (private.rechten(p_gebruiker) ->> 'ai_euro')::numeric;
        v_gebruikt numeric := coalesce((select euro from private.ai_gebruik where gebruiker_id=p_gebruiker
          and maand=date_trunc('month',now())::date),0);
        v_claude text := private.ai_platform_sleutel('anthropic');
        v_openai text := private.ai_platform_sleutel('openai');
begin
  if coalesce(v_budget,0) <= 0 then return jsonb_build_object('fout','De assistent staat even uit.'); end if;
  if v_gebruikt >= v_budget then return jsonb_build_object('fout',
    'Je hebt de assistent deze maand al veel gebruikt. Volgende maand kan het weer.'); end if;
  if v_claude='' and v_openai='' then return jsonb_build_object('fout','De assistent staat nog niet aan.'); end if;
  return (select jsonb_build_object('sleutel',v_claude,'openai_sleutel',v_openai,'prijzen',ai_prijzen)
    from private.platform where id=1);
end; $$;
revoke all on function public.ai_toegang(bigint) from public, anon, authenticated;
grant execute on function public.ai_toegang(bigint) to service_role;

-- Laat alle bestaande opslag-, betaal- en budgetvelden ongewijzigd.
do $$
declare v_definition text;
begin
  select pg_get_functiondef('public.toegang_status(text,text)'::regprocedure) into v_definition;
  v_definition := replace(v_definition,
    'anthropic_sleutel <> '''' and ai_gratis_euro > 0',
    '(private.ai_platform_sleutel(''anthropic'') <> '''' or private.ai_platform_sleutel(''openai'') <> '''') and ai_gratis_euro > 0');
  execute v_definition;
end; $$;
