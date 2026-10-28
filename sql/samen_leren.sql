-- Samen leren: de app wordt slimmer van wat gebruikers samen doen, alleen als iemand daar zelf voor kiest.
--   * Er gaat nooit tekst van berichten, mails, vragen of antwoorden heen, en geen bedragen of namen van mensen.
--   * Wel: welke categorie je aan een winkel of bedrijf geeft ("albert heijn" -> Boodschappen), hoeveel minuten een
--     soort afspraak gemiddeld uitloopt, en per onderwerp hoe vaak je een antwoord goed of niet goed vond.
--   * Anderen zien alleen wat minstens 5 mensen samen hebben bijgedragen (nooit wat één persoon deed).
--   * Zet je het uit, dan wordt je bijdrage meteen leeggemaakt en telt hij niet meer mee.
-- Alleen toevoegen of vervangen, niets weggooien.

alter table private.gebruikers add column if not exists samen_leren boolean not null default false;

create table if not exists private.samen_leren (
  gebruiker bigint not null references private.gebruikers (id),
  soort text not null check (soort in ('categorie', 'uitloop', 'oordeel')),
  sleutel text not null check (length(sleutel) between 1 and 60),
  waarde text not null default '' check (length(waarde) <= 40),
  bijgewerkt timestamptz not null default now(),
  primary key (gebruiker, soort, sleutel)
);
create index if not exists samen_leren_soort_sleutel on private.samen_leren (soort, sleutel);
alter table private.samen_leren enable row level security;

create or replace function public.samen_leren_instellen(p_naam text, p_wachtwoord text, p_aan boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  update private.gebruikers set samen_leren = coalesce(p_aan, false) where id = v_id;
  if not coalesce(p_aan, false) then
    -- Uitzetten: je bijdrage meteen leegmaken.
    update private.samen_leren set waarde = '', bijgewerkt = now() where gebruiker = v_id;
  end if;
  return jsonb_build_object('ok', true, 'aan', coalesce(p_aan, false));
end; $$;

-- p_items: [{"soort": "categorie", "sleutel": "albert heijn", "waarde": "Boodschappen"}, ...]
-- Per soort vervangt dit je vorige bijdrage (wat er niet meer in staat, wordt leeggemaakt).
create or replace function public.samen_leren_bijdragen(p_naam text, p_wachtwoord text, p_items jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
  v_item jsonb;
  v_soort text; v_sleutel text; v_waarde text;
  v_soorten text[] := '{}';
  v_aantal integer := 0;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if not (select samen_leren from private.gebruikers where id = v_id) then
    return jsonb_build_object('fout', 'Samen leren staat uit.');
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 400 then
    return jsonb_build_object('fout', 'Te veel tegelijk.');
  end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_soort := v_item ->> 'soort';
    v_sleutel := lower(trim(coalesce(v_item ->> 'sleutel', '')));
    v_waarde := trim(coalesce(v_item ->> 'waarde', ''));
    if v_soort not in ('categorie', 'uitloop', 'oordeel') or length(v_sleutel) not between 1 and 60
       or length(v_waarde) not between 1 and 40 then
      continue;
    end if;
    -- Alleen woorden, geen rekeningnummers, mailadressen of lange getallen.
    if v_sleutel !~ '^[a-z0-9à-ÿ &''.-]+$' or v_sleutel ~ '[0-9]{4,}' then continue; end if;
    if v_soort = 'uitloop' and v_waarde !~ '^-?[0-9]{1,3}$' then continue; end if;
    if v_soort = 'oordeel' and v_waarde !~ '^[0-9]{1,4}:[0-9]{1,4}$' then continue; end if;
    insert into private.samen_leren (gebruiker, soort, sleutel, waarde, bijgewerkt)
    values (v_id, v_soort, v_sleutel, v_waarde, now())
    on conflict (gebruiker, soort, sleutel) do update set waarde = excluded.waarde, bijgewerkt = now();
    v_soorten := array_append(v_soorten, v_soort);
    v_aantal := v_aantal + 1;
  end loop;
  -- Wat je niet meer bijdraagt (binnen de soorten van deze keer) leegmaken.
  update private.samen_leren s set waarde = '', bijgewerkt = now()
  where s.gebruiker = v_id and s.soort = any (v_soorten) and s.waarde <> ''
    and not exists (select 1 from jsonb_array_elements(p_items) i
                    where i ->> 'soort' = s.soort and lower(trim(coalesce(i ->> 'sleutel', ''))) = s.sleutel);
  return jsonb_build_object('ok', true, 'aantal', v_aantal);
end; $$;

-- Wat de app van iedereen samen heeft geleerd. Alleen wat minstens 5 mensen bijdroegen.
create or replace function public.samen_leren_lezen(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_uit jsonb;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  with mee as (
    select s.* from private.samen_leren s join private.gebruikers g on g.id = s.gebruiker
    where s.waarde <> '' and g.samen_leren and not g.verwijderd and not g.geblokkeerd
  ),
  categorie as (
    select sleutel, waarde, count(*) as mensen,
           count(*)::numeric / sum(count(*)) over (partition by sleutel) as deel
    from mee where soort = 'categorie' group by sleutel, waarde
  ),
  uitloop as (
    select sleutel, round(avg(waarde::integer)) as minuten, count(*) as mensen
    from mee where soort = 'uitloop' group by sleutel having count(*) >= 5
  ),
  oordeel as (
    select sleutel, sum(split_part(waarde, ':', 1)::integer) as goed, sum(split_part(waarde, ':', 2)::integer) as niet,
           count(*) as mensen
    from mee where soort = 'oordeel' group by sleutel having count(*) >= 5
  )
  select jsonb_build_object(
    'aan', (select samen_leren from private.gebruikers where id = v_id),
    'mensen', (select count(distinct gebruiker) from mee),
    'categorie', coalesce((select jsonb_object_agg(sleutel, waarde) from categorie where mensen >= 5 and deel > 0.6), '{}'),
    'uitloop', coalesce((select jsonb_object_agg(sleutel, jsonb_build_object('minuten', minuten, 'mensen', mensen)) from uitloop), '{}'),
    'oordeel', coalesce((select jsonb_object_agg(sleutel, jsonb_build_object('goed', goed, 'niet', niet, 'mensen', mensen)) from oordeel), '{}')
  ) into v_uit;
  return v_uit;
end; $$;

revoke all on function public.samen_leren_instellen(text, text, boolean) from public;
revoke all on function public.samen_leren_bijdragen(text, text, jsonb) from public;
revoke all on function public.samen_leren_lezen(text, text) from public;
grant execute on function public.samen_leren_instellen(text, text, boolean) to anon, authenticated;
grant execute on function public.samen_leren_bijdragen(text, text, jsonb) to anon, authenticated;
grant execute on function public.samen_leren_lezen(text, text) to anon, authenticated;
