-- Betalen kan ook aan met een Stripe-sleutel die als geheim van de Edge Function 'betalen' in Supabase staat
-- (STRIPE_SECRET_KEY), in plaats van in de app. De database kan dat geheim niet zien; de eigenaar zet daarom
-- private.platform.stripe_als_geheim op true. Alle controles "staat betalen aan?" tellen dat mee.
alter table private.platform add column if not exists stripe_als_geheim boolean not null default false;

do $$
declare f record;
begin
  for f in select p.oid from pg_proc p
    where p.prokind = 'f' and pg_get_functiondef(p.oid) like '%stripe_sleutel <> ''''%'
      and pg_get_functiondef(p.oid) not like '%stripe_als_geheim%'
  loop
    execute regexp_replace(pg_get_functiondef(f.oid), '([a-z_]+\.)?stripe_sleutel <> ''''',
      '(\1stripe_sleutel <> '''' or \1stripe_als_geheim)', 'g');
  end loop;
end $$;
