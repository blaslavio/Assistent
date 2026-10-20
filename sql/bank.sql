-- Bankkoppeling via Enable Banking (PSD2, alleen lezen). De app haalt af- en bijschrijvingen op en zet ze in het
-- budget. Niemand kan via deze koppeling geld overmaken. De bank vraagt elke (hooguit) 180 dagen opnieuw om
-- toestemming.
--
-- De sleutel van Enable Banking staat in private.platform en wordt alleen gelezen door de Edge Function `bank`
-- (service-rol). De app zelf ziet hem nooit. Ontkoppelen zet status = 'weg'; rijen blijven bestaan.

alter table private.platform add column if not exists eb_app_id text not null default '';
alter table private.platform add column if not exists eb_sleutel text not null default '';

create table if not exists private.bankkoppelingen (
  id bigint generated always as identity primary key,
  gebruiker_id bigint not null references private.gebruikers(id),
  bank text not null,
  land text not null default 'NL',
  staat text not null default '',          -- willekeurige code om de terugkeer van de bank te herkennen
  sessie text not null default '',         -- sessie-id bij Enable Banking
  rekeningen jsonb not null default '[]'::jsonb,   -- [{uid, iban, naam}]
  status text not null default 'wacht' check (status in ('wacht', 'actief', 'verlopen', 'weg')),
  geldig_tot timestamptz,
  laatst_opgehaald timestamptz,
  fout text not null default '',
  aangemaakt timestamptz not null default now()
);
create index if not exists bankkoppelingen_gebruiker on private.bankkoppelingen (gebruiker_id);
create index if not exists bankkoppelingen_staat on private.bankkoppelingen (staat) where staat <> '';
alter table private.bankkoppelingen enable row level security;

-- --- Voor de eigenaar ------------------------------------------------------------------

create or replace function public.bank_platform_instellen(p_naam text, p_wachtwoord text, p_app_id text,
                                                          p_sleutel text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is distinct from 1 then return jsonb_build_object('geen_toegang', true); end if;
  if coalesce(p_app_id, '') <> '' and p_app_id !~ '^[0-9a-fA-F-]{36}$' then
    return jsonb_build_object('fout', 'Het application ID ziet eruit als 8-4-4-4-12 tekens.');
  end if;
  if coalesce(p_sleutel, '') <> '' and p_sleutel !~ '-----BEGIN (RSA )?PRIVATE KEY-----' then
    return jsonb_build_object('fout', 'Kies het .pem-bestand dat je bij Enable Banking downloadde.');
  end if;
  update private.platform set
    eb_app_id = coalesce(nullif(trim(p_app_id), ''), eb_app_id),
    eb_sleutel = coalesce(nullif(p_sleutel, ''), eb_sleutel)
  where id = 1;
  return jsonb_build_object('ok', true);
end; $$;

-- Wat de gebruiker mag zien: of de bankkoppeling aan staat en zijn eigen koppelingen. Nooit sleutels of sessies.
create or replace function public.bank_status(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object(
    'aan', (select eb_app_id <> '' and eb_sleutel <> '' from private.platform where id = 1),
    'app_id_ingesteld', (select eb_app_id <> '' from private.platform where id = 1),
    'koppelingen', coalesce((select jsonb_agg(jsonb_build_object(
        'id', k.id, 'bank', k.bank, 'status', case when k.status = 'actief' and k.geldig_tot < now() then 'verlopen'
                                                    else k.status end,
        'rekeningen', (select coalesce(jsonb_agg(jsonb_build_object('iban', r->>'iban', 'naam', r->>'naam')), '[]'::jsonb)
                       from jsonb_array_elements(k.rekeningen) r),
        'geldig_tot', k.geldig_tot, 'laatst_opgehaald', k.laatst_opgehaald, 'fout', k.fout) order by k.id)
      from private.bankkoppelingen k where k.gebruiker_id = v_id and k.status in ('actief', 'verlopen')), '[]'::jsonb));
end; $$;

-- --- Alleen voor de Edge Function `bank` (service-rol) -----------------------------------------

create or replace function public.bank_platform()
returns jsonb language sql security definer set search_path to '' as $$
  select jsonb_build_object('app_id', eb_app_id, 'sleutel', eb_sleutel, 'app_adres', app_adres)
  from private.platform where id = 1
$$;

create or replace function public.bank_gebruiker(p_naam text, p_wachtwoord text)
returns bigint language sql security definer set search_path to '' as $$
  select private.gebruiker_id(p_naam, p_wachtwoord)
$$;

create or replace function public.bank_koppeling_starten(p_gebruiker bigint, p_bank text, p_land text, p_staat text)
returns bigint language plpgsql security definer set search_path to '' as $$
declare v_nieuw bigint;
begin
  -- Hooguit tien koppelingen tegelijk per gebruiker (ook halve).
  if (select count(*) from private.bankkoppelingen where gebruiker_id = p_gebruiker and status in ('wacht', 'actief')) >= 10 then
    return null;
  end if;
  -- Oude, nooit afgemaakte pogingen tellen niet meer mee.
  update private.bankkoppelingen set status = 'weg', staat = ''
  where gebruiker_id = p_gebruiker and status = 'wacht' and aangemaakt < now() - interval '1 hour';
  insert into private.bankkoppelingen (gebruiker_id, bank, land, staat)
  values (p_gebruiker, left(p_bank, 80), left(p_land, 2), p_staat) returning id into v_nieuw;
  return v_nieuw;
end; $$;

-- Na de terugkeer van de bank: de koppeling met deze staat (van deze gebruiker, binnen een uur) wordt actief.
create or replace function public.bank_koppeling_afmaken(p_gebruiker bigint, p_staat text, p_sessie text,
                                                         p_rekeningen jsonb, p_geldig_tot timestamptz)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_k private.bankkoppelingen;
begin
  update private.bankkoppelingen set status = 'actief', sessie = p_sessie, rekeningen = p_rekeningen,
         geldig_tot = p_geldig_tot, staat = '', fout = ''
  where gebruiker_id = p_gebruiker and staat = p_staat and p_staat <> '' and status = 'wacht'
    and aangemaakt > now() - interval '1 hour'
  returning * into v_k;
  if v_k.id is null then return null; end if;
  return jsonb_build_object('id', v_k.id, 'bank', v_k.bank);
end; $$;

create or replace function public.bank_koppeling(p_gebruiker bigint, p_id bigint)
returns jsonb language sql security definer set search_path to '' as $$
  select jsonb_build_object('id', id, 'bank', bank, 'sessie', sessie, 'rekeningen', rekeningen, 'status', status,
                            'geldig_tot', geldig_tot, 'laatst_opgehaald', laatst_opgehaald)
  from private.bankkoppelingen where id = p_id and gebruiker_id = p_gebruiker and status in ('actief', 'verlopen')
$$;

create or replace function public.bank_koppeling_bijwerken(p_gebruiker bigint, p_id bigint, p_status text, p_fout text,
                                                           p_opgehaald boolean)
returns boolean language plpgsql security definer set search_path to '' as $$
begin
  update private.bankkoppelingen set
    status = coalesce(nullif(p_status, ''), status),
    fout = coalesce(left(p_fout, 300), fout),
    laatst_opgehaald = case when p_opgehaald then now() else laatst_opgehaald end,
    sessie = case when p_status = 'weg' then '' else sessie end,
    rekeningen = case when p_status = 'weg' then '[]'::jsonb else rekeningen end
  where id = p_id and gebruiker_id = p_gebruiker;
  return found;
end; $$;

create or replace function public.account_verwijderen(p_naam text, p_wachtwoord text)
returns boolean language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null or v_id = 1 then return false; end if;
  if exists (select 1 from private.bestellingen where (koper = v_id or verkoper = v_id)
             and status in ('betaald', 'geleverd', 'geschil')) then
    return false;
  end if;
  update public.gegevens set data = '{}'::jsonb where id = v_id;
  update private.media set verwijderd = true, inhoud = ''::bytea where gebruiker_id = v_id;
  update private.aanbod set actief = false, omschrijving = '', contact = '', in_winkel = false where gebruiker_id = v_id;
  update private.winkels set open = false, omschrijving = '', retour = '', winkeladres = '', lat = null, lon = null where gebruiker_id = v_id;
  update private.ruimtes set weg = true, openbaar = false, titel = '', omschrijving = '' where gebruiker_id = v_id;
  update private.ruimte_items i set weg = true, data = '', klein = '', titel = '', tekst = ''
  from private.ruimtes r where r.id = i.ruimte_id and r.gebruiker_id = v_id;
  update private.document_versies v set titel = '', inhoud = null, html = '', tekst = ''
  from private.documenten d where d.id = v.document_id and d.gebruiker_id = v_id;
  update private.documenten set weg = true, gewist = true, titel = '', inhoud = null, html = '', tekst = ''
  where gebruiker_id = v_id;
  update private.transacties set weg = true, bedrag = 0, omschrijving = '', tegenpartij = '', rekening = ''
  where gebruiker_id = v_id;
  update private.bankkoppelingen set status = 'weg', sessie = '', rekeningen = '[]'::jsonb, staat = ''
  where gebruiker_id = v_id;
  update private.project_leden set actief = false where gebruiker_id = v_id;
  update private.gebruikers set verwijderd = true, naam = null, email = null, weergavenaam = 'Verwijderd account',
         hash = extensions.crypt(extensions.gen_random_uuid()::text, extensions.gen_salt('bf', 4))
  where id = v_id;
  return true;
end; $$;


-- --- Rechten --------------------------------------------------------------------------------

revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function public.bank_platform_instellen(text, text, text, text), public.bank_status(text, text),
  public.account_verwijderen(text, text) from public;
grant execute on function public.bank_platform_instellen(text, text, text, text), public.bank_status(text, text),
  public.account_verwijderen(text, text) to anon, authenticated;
revoke execute on function public.bank_platform(), public.bank_gebruiker(text, text),
  public.bank_koppeling_starten(bigint, text, text, text),
  public.bank_koppeling_afmaken(bigint, text, text, jsonb, timestamptz), public.bank_koppeling(bigint, bigint),
  public.bank_koppeling_bijwerken(bigint, bigint, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.bank_platform(), public.bank_gebruiker(text, text),
  public.bank_koppeling_starten(bigint, text, text, text),
  public.bank_koppeling_afmaken(bigint, text, text, jsonb, timestamptz), public.bank_koppeling(bigint, bigint),
  public.bank_koppeling_bijwerken(bigint, bigint, text, text, boolean)
  to service_role;
