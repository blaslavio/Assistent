-- Betalen via de app met Stripe Connect.
-- Het geld van de koper komt eerst bij het platform (bij Stripe) en gaat pas naar de verkoper als de koper
-- heeft bevestigd dat alles goed is ontvangen. Bij een geschil beslist de beheerder: terug naar de koper of
-- uitbetalen aan de verkoper. Stripe controleert de identiteit van elke verkoper.
-- De Stripe-functie (supabase/functions/betalen) gebruikt de service-rol; de app nooit.

create table if not exists private.platform (
  id integer primary key default 1 check (id = 1),
  stripe_sleutel text not null default '',
  stripe_webhook_geheim text not null default '',
  kosten_vast numeric(6, 2) not null default 0.50,
  kosten_procent numeric(5, 2) not null default 3.00,
  app_adres text not null default ''
);
insert into private.platform (id) values (1) on conflict do nothing;

alter table private.gebruikers add column if not exists stripe_account text;
alter table private.gebruikers add column if not exists stripe_klaar boolean not null default false;
alter table private.bestellingen add column if not exists kosten numeric(10, 2);
alter table private.bestellingen add column if not exists stripe_sessie text;
alter table private.bestellingen add column if not exists stripe_betaling text;
alter table private.bestellingen add column if not exists uitbetaald boolean not null default false;

-- Kopersbescherming: vaste kosten + percentage, betaald door de koper.
create or replace function private.kosten(p_bedrag numeric)
returns numeric language sql stable security definer set search_path to '' as $$
  select round(kosten_vast + coalesce(p_bedrag, 0) * kosten_procent / 100, 2) from private.platform where id = 1
$$;

-- --- Voor de eigenaar ------------------------------------------------------------------

create or replace function public.platform_instellen(p_naam text, p_wachtwoord text, p_stripe_sleutel text,
                                                     p_webhook_geheim text, p_app_adres text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is distinct from 1 then return jsonb_build_object('geen_toegang', true); end if;
  if coalesce(p_stripe_sleutel, '') <> '' and p_stripe_sleutel !~ '^(sk|rk)_(test|live)_' then
    return jsonb_build_object('fout', 'Dit lijkt geen geheime Stripe-sleutel. Die begint met sk_live_ of sk_test_.');
  end if;
  if coalesce(p_webhook_geheim, '') <> '' and p_webhook_geheim !~ '^whsec_' then
    return jsonb_build_object('fout', 'Het webhookgeheim begint met whsec_.');
  end if;
  update private.platform set
    stripe_sleutel = coalesce(nullif(p_stripe_sleutel, ''), stripe_sleutel),
    stripe_webhook_geheim = coalesce(nullif(p_webhook_geheim, ''), stripe_webhook_geheim),
    app_adres = coalesce(nullif(trim(p_app_adres), ''), app_adres)
  where id = 1;
  return jsonb_build_object('ok', true);
end; $$;

-- Wat iedereen mag weten: of betalen via de app aan staat en wat de kosten zijn. Nooit de sleutels.
create or replace function public.betalen_status(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return (select jsonb_build_object(
    'aan', p.stripe_sleutel <> '' and p.stripe_webhook_geheim <> '',
    'testmodus', p.stripe_sleutel like '%\_test\_%',
    'sleutel_ingesteld', p.stripe_sleutel <> '', 'webhook_ingesteld', p.stripe_webhook_geheim <> '',
    'app_adres', p.app_adres, 'kosten_vast', p.kosten_vast, 'kosten_procent', p.kosten_procent,
    'ik_kan_ontvangen', (select stripe_klaar from private.gebruikers where id = v_id),
    'ik_ben_aangemeld', (select stripe_account is not null from private.gebruikers where id = v_id))
    from private.platform p where p.id = 1);
end; $$;

-- Betalen via de app kan alleen bij verkopers die door Stripe zijn gecontroleerd.
create or replace function public.aanbod_plaatsen(p_naam text, p_wachtwoord text, p_soort text, p_titel text,
                                                  p_omschrijving text, p_prijs numeric, p_prijs_per text,
                                                  p_plaats text, p_contact text, p_betaalwijzen text[], p_levering text[])
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_aanbod bigint; v_nieuw boolean;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if p_soort not in ('product', 'dienst', 'training', 'les') then return jsonb_build_object('fout', 'Kies een soort.'); end if;
  if trim(coalesce(p_titel, '')) = '' then return jsonb_build_object('fout', 'Vul een titel in.'); end if;
  if v_id <> 1 and not exists (select 1 from private.gebruikers where id = v_id and email is not null) then
    return jsonb_build_object('fout', 'Vul eerst je mailadres in bij Instellingen › Account.');
  end if;
  if coalesce(array_length(p_betaalwijzen, 1), 0) = 0
     or not p_betaalwijzen <@ array['app', 'tikkie', 'contant', 'overmaken'] then
    return jsonb_build_object('fout', 'Kies hoe er betaald kan worden.');
  end if;
  if 'app' = any(p_betaalwijzen) then
    if not (select stripe_klaar from private.gebruikers where id = v_id) then
      return jsonb_build_object('fout', 'Om betalingen via de app te ontvangen, meld je je eerst aan als verkoper (Marktplaats › Aanbieden).');
    end if;
    if coalesce(p_prijs, 0) < 1 then
      return jsonb_build_object('fout', 'Betalen via de app kan vanaf 1 euro. Vul een prijs in.');
    end if;
  end if;
  if coalesce(array_length(p_levering, 1), 0) = 0
     or not p_levering <@ array['ophalen', 'verzenden', 'op_locatie', 'online'] then
    return jsonb_build_object('fout', 'Kies hoe het product of de dienst bij de koper komt.');
  end if;
  v_nieuw := v_id <> 1 and (select aangemaakt > now() - interval '7 days' from private.gebruikers where id = v_id)
             and not exists (select 1 from private.bestellingen where verkoper = v_id and status = 'afgerond');
  if v_nieuw and (select count(*) from private.aanbod where gebruiker_id = v_id and actief) >= 5 then
    return jsonb_build_object('fout', 'Nieuwe accounts kunnen de eerste week maximaal 5 dingen tegelijk aanbieden.');
  end if;
  if (select count(*) from private.aanbod where gebruiker_id = v_id and aangemaakt > now() - interval '1 day') >= 20 then
    return jsonb_build_object('fout', 'Je kunt maximaal 20 dingen per dag plaatsen.');
  end if;
  insert into private.aanbod (gebruiker_id, soort, titel, omschrijving, prijs, prijs_per, plaats, contact, betaalwijzen, levering)
  values (v_id, p_soort, left(trim(p_titel), 120), left(coalesce(p_omschrijving, ''), 4000),
          case when p_prijs < 0 then null else p_prijs end,
          left(coalesce(p_prijs_per, ''), 30), left(coalesce(p_plaats, ''), 80), left(coalesce(p_contact, ''), 200),
          p_betaalwijzen, p_levering)
  returning id into v_aanbod;
  return jsonb_build_object('ok', true, 'id', v_aanbod);
end; $$;

-- Bij betalen via de app gaat "ontvangen" via de Stripe-functie (die betaalt de verkoper dan uit).
create or replace function public.bestelling_bijwerken(p_naam text, p_wachtwoord text, p_id bigint, p_actie text,
                                                       p_toelichting text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); b private.bestellingen; v_nieuw text; v_tekst text;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into b from private.bestellingen where id = p_id and (koper = v_id or verkoper = v_id) for update;
  if b.id is null then return jsonb_build_object('fout', 'Bestelling niet gevonden.'); end if;
  if v_id = b.verkoper then
    v_nieuw := case
      when p_actie = 'accepteren' and b.status = 'aangevraagd' then 'geaccepteerd'
      when p_actie = 'weigeren' and b.status in ('aangevraagd', 'geaccepteerd') then 'geannuleerd'
      when p_actie = 'betaling_ontvangen' and b.status = 'geaccepteerd' and b.betaalwijze <> 'app' then 'betaald'
      when p_actie = 'geleverd' and (b.status = 'betaald' or (b.status = 'geaccepteerd' and b.betaalwijze = 'contant'))
        then 'geleverd'
    end;
  end if;
  if v_nieuw is null and v_id = b.koper then
    v_nieuw := case
      when p_actie = 'annuleren' and b.status in ('aangevraagd', 'geaccepteerd') then 'geannuleerd'
      when p_actie = 'ontvangen' and b.status in ('betaald', 'geleverd') and b.betaalwijze <> 'app' then 'afgerond'
      when p_actie = 'probleem' and b.status in ('betaald', 'geleverd') then 'geschil'
    end;
  end if;
  if v_nieuw is null then return jsonb_build_object('fout', 'Dat kan nu niet bij deze bestelling.'); end if;
  if v_nieuw = 'geschil' and coalesce(trim(p_toelichting), '') = '' then
    return jsonb_build_object('fout', 'Beschrijf wat er mis is.');
  end if;
  update private.bestellingen set status = v_nieuw, bijgewerkt = now(),
         geschil_reden = case when v_nieuw = 'geschil' then left(trim(p_toelichting), 1000) else geschil_reden end
  where id = p_id;
  v_tekst := case v_nieuw
    when 'geaccepteerd' then 'Bestelling geaccepteerd' || case when b.betaalwijze = 'app' then '. Je kunt nu betalen in de app.' else '.' end
    when 'geannuleerd' then 'Bestelling geannuleerd'
    when 'betaald' then 'Betaling ontvangen, bedankt!'
    when 'geleverd' then 'Geleverd. Laat je weten of alles goed is ontvangen?'
    when 'afgerond' then 'Alles goed ontvangen, bedankt!'
    when 'geschil' then 'Er is een probleem gemeld'
  end || case when coalesce(trim(p_toelichting), '') <> '' then ': ' || left(trim(p_toelichting), 1000) else '' end;
  perform private.bericht(b.aanbod_id, v_id, case when v_id = b.koper then b.verkoper else b.koper end, v_tekst);
  if v_nieuw = 'afgerond' then
    update private.aanbod set actief = false where id = b.aanbod_id and soort = 'product';
  end if;
  return jsonb_build_object('ok', true, 'status', v_nieuw);
end; $$;

-- --- Alleen voor de Stripe-functie (service-rol) -----------------------------------------

create or replace function public.stripe_platform()
returns jsonb language sql security definer set search_path to '' as $$
  select jsonb_build_object('sleutel', stripe_sleutel, 'webhook_geheim', stripe_webhook_geheim, 'app_adres', app_adres)
  from private.platform where id = 1
$$;

-- Controleert naam en wachtwoord en geeft wat de Stripe-functie over de gebruiker moet weten.
create or replace function public.stripe_gebruiker(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return null; end if;
  return (select jsonb_build_object('id', id, 'email', email, 'stripe_account', stripe_account, 'beheerder', id = 1)
          from private.gebruikers where id = v_id);
end; $$;

create or replace function public.stripe_account_opslaan(p_gebruiker bigint, p_account text)
returns void language sql security definer set search_path to '' as $$
  update private.gebruikers set stripe_account = p_account where id = p_gebruiker and stripe_account is null
$$;

create or replace function public.stripe_account_klaar(p_account text, p_klaar boolean)
returns void language sql security definer set search_path to '' as $$
  update private.gebruikers set stripe_klaar = p_klaar where stripe_account = p_account
$$;

create or replace function public.stripe_bestelling(p_id bigint)
returns jsonb language sql security definer set search_path to '' as $$
  select jsonb_build_object('id', b.id, 'titel', b.titel, 'bedrag', b.bedrag, 'kosten', private.kosten(b.bedrag),
                            'status', b.status, 'betaalwijze', b.betaalwijze, 'koper', b.koper, 'verkoper', b.verkoper,
                            'stripe_betaling', b.stripe_betaling, 'uitbetaald', b.uitbetaald,
                            'verkoper_account', g.stripe_account, 'verkoper_klaar', g.stripe_klaar)
  from private.bestellingen b join private.gebruikers g on g.id = b.verkoper where b.id = p_id
$$;

create or replace function public.stripe_sessie_opslaan(p_id bigint, p_sessie text, p_kosten numeric)
returns void language sql security definer set search_path to '' as $$
  update private.bestellingen set stripe_sessie = p_sessie, kosten = p_kosten where id = p_id
$$;

-- Webhook: betaling gelukt. Alleen vanuit 'geaccepteerd', en alleen voor de sessie die we zelf maakten.
create or replace function public.stripe_betaald(p_id bigint, p_sessie text, p_betaling text)
returns boolean language plpgsql security definer set search_path to '' as $$
declare b private.bestellingen;
begin
  update private.bestellingen set status = 'betaald', stripe_betaling = p_betaling, bijgewerkt = now()
  where id = p_id and stripe_sessie = p_sessie and status = 'geaccepteerd' and betaalwijze = 'app'
  returning * into b;
  if b.id is null then return false; end if;
  perform private.bericht(b.aanbod_id, b.koper, b.verkoper,
    'Betaald via de app. Het geld staat veilig bij Stripe en gaat naar je toe zodra ik heb bevestigd dat alles goed is ontvangen.');
  return true;
end; $$;

-- Koper bevestigt ontvangst (of beheerder beslist voor de verkoper): status afgerond, daarna uitbetalen.
create or replace function public.stripe_vrijgeven(p_id bigint, p_door bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare b private.bestellingen;
begin
  update private.bestellingen set status = 'afgerond', bijgewerkt = now()
  where id = p_id and betaalwijze = 'app' and not uitbetaald
    and ((koper = p_door and status in ('betaald', 'geleverd')) or (p_door = 1 and status = 'geschil'))
  returning * into b;
  if b.id is null then return null; end if;
  perform private.bericht(b.aanbod_id, b.koper, b.verkoper, 'Alles goed ontvangen, bedankt! De betaling wordt aan je uitbetaald.');
  update private.aanbod set actief = false where id = b.aanbod_id and soort = 'product';
  return jsonb_build_object('bedrag', b.bedrag, 'verkoper', b.verkoper, 'stripe_betaling', b.stripe_betaling);
end; $$;

create or replace function public.stripe_uitbetaald(p_id bigint)
returns void language sql security definer set search_path to '' as $$
  update private.bestellingen set uitbetaald = true where id = p_id
$$;

create or replace function public.stripe_terugbetaald(p_id bigint)
returns boolean language plpgsql security definer set search_path to '' as $$
declare b private.bestellingen;
begin
  update private.bestellingen set status = 'terugbetaald', bijgewerkt = now()
  where id = p_id and betaalwijze = 'app' and status = 'geschil' and not uitbetaald returning * into b;
  if b.id is null then return false; end if;
  perform private.bericht(b.aanbod_id, b.verkoper, b.koper, 'De beheerder heeft besloten: je krijgt je geld terug via Stripe.');
  return true;
end; $$;

-- Geschil bij betalen via de app moet via de Stripe-functie (terugbetalen of uitbetalen).
create or replace function public.beheer_geschil_afhandelen(p_naam text, p_wachtwoord text, p_id bigint, p_uitkomst text)
returns boolean language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is distinct from 1 or p_uitkomst not in ('koper', 'verkoper') then return false; end if;
  update private.bestellingen set status = case when p_uitkomst = 'koper' then 'terugbetaald' else 'afgerond' end,
         bijgewerkt = now()
  where id = p_id and status = 'geschil' and betaalwijze <> 'app';
  return found;
end; $$;

create or replace function public.mijn_bestellingen(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object('bestellingen', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', b.id, 'aanbod_id', b.aanbod_id, 'titel', b.titel, 'bedrag', b.bedrag, 'betaalwijze', b.betaalwijze,
      'kosten', case when b.betaalwijze = 'app' then coalesce(b.kosten, private.kosten(b.bedrag)) end,
      'levering', b.levering, 'status', b.status, 'aangemaakt', b.aangemaakt, 'bijgewerkt', b.bijgewerkt,
      'uitbetaald', b.uitbetaald,
      'rol', case when b.koper = v_id then 'koper' else 'verkoper' end,
      'ander_id', case when b.koper = v_id then b.verkoper else b.koper end,
      'ander', private.weergave(case when b.koper = v_id then b.verkoper else b.koper end),
      'vertrouwen_ander', private.vertrouwen(case when b.koper = v_id then b.verkoper else b.koper end),
      'beoordeeld', exists (select 1 from private.beoordelingen r where r.bestelling_id = b.id and r.door = v_id))
      order by b.bijgewerkt desc)
    from private.bestellingen b
    where (b.koper = v_id or b.verkoper = v_id)
      and (b.status not in ('afgerond', 'geannuleerd', 'terugbetaald') or b.bijgewerkt > now() - interval '60 days')),
    '[]'::jsonb));
end; $$;

-- Verkopers met Stripe tonen als "geverifieerd".
create or replace function private.vertrouwen(p_id bigint)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object(
    'lid_sinds', g.aangemaakt,
    'nieuw', g.aangemaakt > now() - interval '7 days',
    'sterren', (select round(avg(sterren), 1) from private.beoordelingen where over = p_id),
    'beoordelingen', (select count(*) from private.beoordelingen where over = p_id),
    'verkocht', (select count(*) from private.bestellingen where verkoper = p_id and status = 'afgerond'),
    'email', g.email is not null or g.id = 1,
    'email_bevestigd', g.email_bevestigd,
    'geverifieerd', g.stripe_klaar)
  from private.gebruikers g where g.id = p_id
$$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.stripe_platform(), public.stripe_gebruiker(text, text),
  public.stripe_account_opslaan(bigint, text), public.stripe_account_klaar(text, boolean),
  public.stripe_bestelling(bigint), public.stripe_sessie_opslaan(bigint, text, numeric),
  public.stripe_betaald(bigint, text, text), public.stripe_vrijgeven(bigint, bigint),
  public.stripe_uitbetaald(bigint), public.stripe_terugbetaald(bigint)
  from public, anon, authenticated;
grant execute on function public.stripe_platform(), public.stripe_gebruiker(text, text),
  public.stripe_account_opslaan(bigint, text), public.stripe_account_klaar(text, boolean),
  public.stripe_bestelling(bigint), public.stripe_sessie_opslaan(bigint, text, numeric),
  public.stripe_betaald(bigint, text, text), public.stripe_vrijgeven(bigint, bigint),
  public.stripe_uitbetaald(bigint), public.stripe_terugbetaald(bigint)
  to service_role;
