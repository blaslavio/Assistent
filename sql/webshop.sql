-- Webshop: verkopers en ondernemers krijgen een eigen winkelpagina met een vast adres (?winkel=naam).
-- Iedereen mag de winkel bekijken, ook zonder account; bestellen kan met een (gratis) account.
-- In de webshop wordt altijd via de app betaald. De koper betaalt geen kopersbescherming; de verkoper betaalt
-- commissie (5%, minimaal € 0,35, inclusief betaalkosten), die bij het uitbetalen wordt ingehouden.
-- Voorraad: bij bestellen gaat de voorraad omlaag; bij annuleren (of niet betalen binnen 75 minuten) weer omhoog.

alter table private.platform add column if not exists commissie_procent numeric(5, 2) not null default 5.00;
alter table private.platform add column if not exists commissie_min numeric(6, 2) not null default 0.35;

alter table private.aanbod add column if not exists in_winkel boolean not null default false;
alter table private.aanbod add column if not exists voorraad integer check (voorraad >= 0);

alter table private.bestellingen add column if not exists webshop boolean not null default false;
alter table private.bestellingen add column if not exists aantal integer not null default 1 check (aantal between 1 and 99);
alter table private.bestellingen add column if not exists verzendkosten numeric(10, 2) not null default 0;
alter table private.bestellingen add column if not exists commissie numeric(10, 2);

create table if not exists private.winkels (
  gebruiker_id bigint primary key references private.gebruikers(id),
  adres text not null unique check (adres ~ '^[a-z0-9][a-z0-9-]{2,29}$'),
  naam text not null,
  omschrijving text not null default '',
  kleur text not null default '#2563eb' check (kleur ~ '^#[0-9a-fA-F]{6}$'),
  verzendkosten numeric(6, 2) not null default 0 check (verzendkosten between 0 and 100),
  gratis_vanaf numeric(8, 2) check (gratis_vanaf >= 0),
  retour text not null default '',
  open boolean not null default false,
  aangemaakt timestamptz not null default now()
);

-- Commissie over een webshopbestelling: percentage met een minimum, nooit meer dan het bedrag zelf.
create or replace function private.commissie(p_bedrag numeric)
returns numeric language sql stable security definer set search_path to '' as $$
  select least(p_bedrag, greatest(commissie_min, round(p_bedrag * commissie_procent / 100, 2)))
  from private.platform where id = 1
$$;

-- Niet betaalde webshopbestellingen vervallen (de betaalpagina van Stripe verloopt na een uur).
create or replace function private.webshop_opruimen()
returns void language sql security definer set search_path to '' as $$
  update private.bestellingen set status = 'geannuleerd', bijgewerkt = now()
  where webshop and status = 'geaccepteerd' and stripe_betaling is null and aangemaakt < now() - interval '75 minutes'
$$;

-- Voorraad terug bij een geannuleerde webshopbestelling.
create or replace function private.voorraad_terug()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.webshop and new.status = 'geannuleerd' and old.status <> 'geannuleerd' then
    update private.aanbod set voorraad = voorraad + new.aantal where id = new.aanbod_id and voorraad is not null;
  end if;
  return new;
end; $$;

create or replace trigger voorraad_terug after update of status on private.bestellingen
  for each row execute function private.voorraad_terug();

create or replace function private.winkel_kan_betalen(p_gebruiker bigint)
returns boolean language sql stable security definer set search_path to '' as $$
  select coalesce((select stripe_klaar from private.gebruikers where id = p_gebruiker), false)
     and exists (select 1 from private.platform where id = 1 and stripe_sleutel <> '' and stripe_webhook_geheim <> '')
$$;

create or replace function private.winkel_json(w private.winkels)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('adres', w.adres, 'naam', w.naam, 'omschrijving', w.omschrijving, 'kleur', w.kleur,
                            'verzendkosten', w.verzendkosten, 'gratis_vanaf', w.gratis_vanaf, 'retour', w.retour,
                            'open', w.open)
$$;

-- --- Voor de verkoper -------------------------------------------------------------------

create or replace function public.mijn_winkel(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object(
    'winkel', (select private.winkel_json(w) from private.winkels w where w.gebruiker_id = v_id),
    'niveau', case when v_id = 1 then 'ondernemer' else (select niveau from private.gebruikers where id = v_id) end,
    'kan_betalen', private.winkel_kan_betalen(v_id),
    'commissie_procent', (select commissie_procent from private.platform where id = 1),
    'commissie_min', (select commissie_min from private.platform where id = 1),
    'producten', coalesce((select jsonb_agg(jsonb_build_object(
        'id', a.id, 'titel', a.titel, 'prijs', a.prijs, 'actief', a.actief, 'geblokkeerd', a.geblokkeerd,
        'in_winkel', a.in_winkel, 'voorraad', a.voorraad, 'betaalwijzen', to_jsonb(a.betaalwijzen),
        'levering', to_jsonb(a.levering)) order by a.id desc)
      from private.aanbod a where a.gebruiker_id = v_id and a.soort = 'product'), '[]'::jsonb),
    'verkopen', (select jsonb_build_object('aantal', count(*), 'omzet', coalesce(sum(bedrag), 0),
                                           'commissie', coalesce(sum(commissie), 0))
                 from private.bestellingen where verkoper = v_id and webshop
                   and status in ('betaald', 'geleverd', 'afgerond')));
end; $$;

create or replace function public.winkel_instellen(p_naam text, p_wachtwoord text, p_adres text, p_winkelnaam text,
                                                   p_omschrijving text, p_kleur text, p_verzendkosten numeric,
                                                   p_gratis_vanaf numeric, p_retour text, p_open boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_adres text := lower(trim(coalesce(p_adres, '')));
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if v_id <> 1 and (select niveau from private.gebruikers where id = v_id) not in ('verkoper', 'ondernemer') then
    return jsonb_build_object('fout', 'Een webshop kan met accounttype Verkoper of Ondernemer (Instellingen › Account).');
  end if;
  if v_adres !~ '^[a-z0-9][a-z0-9-]{2,29}$' then
    return jsonb_build_object('fout', 'Kies een webadres van 3 tot 30 tekens: kleine letters, cijfers en streepjes.');
  end if;
  if trim(coalesce(p_winkelnaam, '')) = '' then return jsonb_build_object('fout', 'Geef je winkel een naam.'); end if;
  if exists (select 1 from private.winkels where adres = v_adres and gebruiker_id <> v_id) then
    return jsonb_build_object('fout', 'Dit webadres is al in gebruik. Kies een ander.');
  end if;
  if coalesce(p_kleur, '') !~ '^#[0-9a-fA-F]{6}$' then p_kleur := '#2563eb'; end if;
  if coalesce(p_verzendkosten, 0) not between 0 and 100 or coalesce(p_gratis_vanaf, 0) < 0 then
    return jsonb_build_object('fout', 'Vul geldige verzendkosten in.');
  end if;
  if p_open and not private.winkel_kan_betalen(v_id) then
    return jsonb_build_object('fout', 'Je winkel kan open zodra je betalingen via de app kunt ontvangen. '
      || 'Meld je daarvoor aan bij Stripe (Kopen en verkopen › Verkopen).');
  end if;
  insert into private.winkels (gebruiker_id, adres, naam, omschrijving, kleur, verzendkosten, gratis_vanaf, retour, open)
  values (v_id, v_adres, left(trim(p_winkelnaam), 60), left(coalesce(p_omschrijving, ''), 2000), p_kleur,
          coalesce(p_verzendkosten, 0), p_gratis_vanaf, left(coalesce(p_retour, ''), 1000), coalesce(p_open, false))
  on conflict (gebruiker_id) do update set adres = excluded.adres, naam = excluded.naam,
    omschrijving = excluded.omschrijving, kleur = excluded.kleur, verzendkosten = excluded.verzendkosten,
    gratis_vanaf = excluded.gratis_vanaf, retour = excluded.retour, open = excluded.open;
  return jsonb_build_object('ok', true, 'adres', v_adres);
end; $$;

-- Een product in of uit de webshop zetten, met voorraad (leeg = één stuk, zoals op de marktplaats).
create or replace function public.winkel_product(p_naam text, p_wachtwoord text, p_aanbod bigint, p_in_winkel boolean,
                                                 p_voorraad integer)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_a private.aanbod;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into v_a from private.aanbod where id = p_aanbod and gebruiker_id = v_id and soort = 'product';
  if v_a.id is null then return jsonb_build_object('fout', 'Product niet gevonden.'); end if;
  if p_in_winkel and not exists (select 1 from private.winkels where gebruiker_id = v_id) then
    return jsonb_build_object('fout', 'Maak eerst je winkel aan.');
  end if;
  if p_in_winkel and not 'app' = any(v_a.betaalwijzen) then
    return jsonb_build_object('fout', 'In de webshop wordt via de app betaald. Plaats het product opnieuw met betalen via de app.');
  end if;
  if p_in_winkel and not v_a.levering && array['verzenden', 'ophalen'] then
    return jsonb_build_object('fout', 'Een webshopproduct wordt verzonden of opgehaald.');
  end if;
  if p_voorraad is not null and p_voorraad not between 0 and 100000 then
    return jsonb_build_object('fout', 'Vul een voorraad van 0 tot 100000 in.');
  end if;
  update private.aanbod set in_winkel = coalesce(p_in_winkel, false), voorraad = p_voorraad,
         actief = case when p_voorraad > 0 then true else actief end
  where id = p_aanbod;
  return jsonb_build_object('ok', true);
end; $$;

-- --- Voor iedereen, ook zonder account ---------------------------------------------------

create or replace function public.winkel_bekijken(p_adres text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare w private.winkels;
begin
  select * into w from private.winkels where adres = lower(trim(coalesce(p_adres, ''))) and open;
  if w.gebruiker_id is null or exists (select 1 from private.gebruikers where id = w.gebruiker_id
                                       and (geblokkeerd or verwijderd)) then
    return jsonb_build_object('fout', 'Deze winkel bestaat niet of is nu gesloten.');
  end if;
  perform private.webshop_opruimen();
  return private.winkel_json(w) || jsonb_build_object(
    'verkoper', private.weergave(w.gebruiker_id), 'verkoper_id', w.gebruiker_id,
    'vertrouwen', private.vertrouwen(w.gebruiker_id),
    'kan_betalen', private.winkel_kan_betalen(w.gebruiker_id),
    'producten', coalesce((select jsonb_agg(jsonb_build_object(
        'id', a.id, 'titel', a.titel, 'omschrijving', a.omschrijving, 'prijs', a.prijs, 'plaats', a.plaats,
        'levering', to_jsonb(array(select unnest(a.levering) intersect select unnest(array['verzenden', 'ophalen']))),
        'voorraad', a.voorraad, 'uitverkocht', not a.actief or a.voorraad = 0) order by (not a.actief or a.voorraad = 0), a.id desc)
      from private.aanbod a
      where a.gebruiker_id = w.gebruiker_id and a.in_winkel and not a.geblokkeerd
        and (a.actief or a.voorraad is not null)), '[]'::jsonb));
end; $$;

create or replace function public.webshop_bestellen(p_naam text, p_wachtwoord text, p_aanbod bigint, p_aantal integer,
                                                    p_levering text, p_bericht text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_a private.aanbod; w private.winkels;
        v_verzend numeric; v_bedrag numeric; v_best bigint; v_aantal integer := coalesce(p_aantal, 1);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  perform private.webshop_opruimen();
  select * into v_a from private.aanbod where id = p_aanbod and in_winkel and not geblokkeerd for update;
  select * into w from private.winkels where gebruiker_id = v_a.gebruiker_id and open;
  if v_a.id is null or w.gebruiker_id is null then
    return jsonb_build_object('fout', 'Dit product is niet meer te koop.');
  end if;
  if v_a.gebruiker_id = v_id then return jsonb_build_object('fout', 'Dit is je eigen product.'); end if;
  if v_id <> 1 and not exists (select 1 from private.gebruikers where id = v_id and email is not null) then
    return jsonb_build_object('fout', 'Vul eerst je mailadres in bij Instellingen › Account.');
  end if;
  if not private.winkel_kan_betalen(v_a.gebruiker_id) then
    return jsonb_build_object('fout', 'Deze winkel kan nu geen betalingen ontvangen. Probeer het later opnieuw.');
  end if;
  if v_aantal not between 1 and 99 then return jsonb_build_object('fout', 'Kies een aantal van 1 tot 99.'); end if;
  if p_levering not in ('verzenden', 'ophalen') or not p_levering = any(v_a.levering) then
    return jsonb_build_object('fout', 'De verkoper biedt deze manier van leveren niet aan.');
  end if;
  if v_a.voorraad is null then
    if not v_a.actief then return jsonb_build_object('fout', 'Dit product is uitverkocht.'); end if;
    if v_aantal > 1 then return jsonb_build_object('fout', 'Hiervan is er maar één.'); end if;
    if exists (select 1 from private.bestellingen where aanbod_id = v_a.id
               and status in ('aangevraagd', 'geaccepteerd', 'betaald', 'geleverd')) then
      return jsonb_build_object('fout', 'Iemand anders is dit net aan het kopen.');
    end if;
  elsif v_a.voorraad < v_aantal then
    return jsonb_build_object('fout', case when v_a.voorraad = 0 then 'Dit product is uitverkocht.'
                                           else format('Er zijn er nog maar %s.', v_a.voorraad) end);
  end if;
  if (select count(*) from private.bestellingen where koper = v_id and status in ('aangevraagd', 'geaccepteerd'))
     >= (case when (select aangemaakt > now() - interval '7 days' from private.gebruikers where id = v_id) then 3 else 10 end) then
    return jsonb_build_object('fout', 'Je hebt al veel openstaande bestellingen. Rond die eerst af of annuleer ze.');
  end if;
  v_verzend := case when p_levering = 'verzenden'
                      and not (w.gratis_vanaf is not null and v_a.prijs * v_aantal >= w.gratis_vanaf)
                    then w.verzendkosten else 0 end;
  v_bedrag := v_a.prijs * v_aantal + v_verzend;
  if v_bedrag < 1 then return jsonb_build_object('fout', 'Betalen via de app kan vanaf 1 euro.'); end if;
  update private.aanbod set voorraad = voorraad - v_aantal where id = v_a.id and voorraad is not null;
  insert into private.bestellingen (aanbod_id, koper, verkoper, titel, bedrag, betaalwijze, levering, status,
                                    webshop, aantal, verzendkosten, commissie, kosten)
  values (v_a.id, v_id, v_a.gebruiker_id, v_a.titel || case when v_aantal > 1 then format(' (%s×)', v_aantal) else '' end,
          v_bedrag, 'app', p_levering, 'geaccepteerd', true, v_aantal, v_verzend, private.commissie(v_bedrag), 0)
  returning id into v_best;
  perform private.bericht(v_a.id, v_id, v_a.gebruiker_id,
    format('Webshopbestelling: %s× %s, %s', v_aantal, v_a.titel, replace(p_levering, '_', ' ')) ||
    case when coalesce(trim(p_bericht), '') <> '' then '. ' || left(trim(p_bericht), 1000) else '' end);
  return jsonb_build_object('ok', true, 'id', v_best, 'bedrag', v_bedrag, 'verzendkosten', v_verzend);
end; $$;

-- --- Bestaande functies, aangevuld voor de webshop ---------------------------------------

-- Op de marktplaats zie je dat iets in een webshop staat; bestellen gaat dan via de webshop.
create or replace function private.aanbod_json(a private.aanbod, p_ik bigint)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object(
    'id', a.id, 'soort', a.soort, 'titel', a.titel, 'omschrijving', a.omschrijving, 'prijs', a.prijs,
    'prijs_per', a.prijs_per, 'plaats', a.plaats, 'contact', a.contact, 'actief', a.actief,
    'betaalwijzen', to_jsonb(a.betaalwijzen), 'levering', to_jsonb(a.levering),
    'aanbieder', private.weergave(a.gebruiker_id), 'aanbieder_id', a.gebruiker_id, 'van_mij', a.gebruiker_id = p_ik,
    'vertrouwen', private.vertrouwen(a.gebruiker_id), 'aangemaakt', a.aangemaakt,
    'in_winkel', a.in_winkel, 'voorraad', a.voorraad,
    'winkel', case when a.in_winkel then (select w.adres from private.winkels w
                                         where w.gebruiker_id = a.gebruiker_id and w.open) end,
    'vrije_tijden', (select count(*) from private.tijdsloten t
                     where t.aanbod_id = a.id and t.geboekt_door is null and not t.geannuleerd and t.start > now()))
$$;

create or replace function public.bestellen(p_naam text, p_wachtwoord text, p_aanbod bigint, p_betaalwijze text,
                                            p_levering text, p_bericht text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_a private.aanbod; v_best bigint;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into v_a from private.aanbod where id = p_aanbod and actief and not geblokkeerd;
  if v_a.id is null then return jsonb_build_object('fout', 'Dit aanbod is niet meer beschikbaar.'); end if;
  if v_a.in_winkel and exists (select 1 from private.winkels where gebruiker_id = v_a.gebruiker_id and open) then
    return jsonb_build_object('fout', 'Dit product bestel je in de webshop van de verkoper.');
  end if;
  if v_a.gebruiker_id = v_id then return jsonb_build_object('fout', 'Dit is je eigen aanbod.'); end if;
  if v_id <> 1 and not exists (select 1 from private.gebruikers where id = v_id and email is not null) then
    return jsonb_build_object('fout', 'Vul eerst je mailadres in bij Instellingen › Account.');
  end if;
  if not p_betaalwijze = any(v_a.betaalwijzen) then
    return jsonb_build_object('fout', 'De verkoper accepteert deze betaalwijze niet.');
  end if;
  if not p_levering = any(v_a.levering) then
    return jsonb_build_object('fout', 'De verkoper biedt deze manier van leveren niet aan.');
  end if;
  if exists (select 1 from private.bestellingen where aanbod_id = p_aanbod and koper = v_id
             and status in ('aangevraagd', 'geaccepteerd', 'betaald', 'geleverd')) then
    return jsonb_build_object('fout', 'Je hebt dit al besteld. Kijk bij Bestellingen.');
  end if;
  if (select count(*) from private.bestellingen where koper = v_id and status in ('aangevraagd', 'geaccepteerd'))
     >= (case when (select aangemaakt > now() - interval '7 days' from private.gebruikers where id = v_id) then 3 else 10 end) then
    return jsonb_build_object('fout', 'Je hebt al veel openstaande bestellingen. Rond die eerst af of annuleer ze.');
  end if;
  insert into private.bestellingen (aanbod_id, koper, verkoper, titel, bedrag, betaalwijze, levering)
  values (p_aanbod, v_id, v_a.gebruiker_id, v_a.titel, v_a.prijs, p_betaalwijze, p_levering)
  returning id into v_best;
  perform private.bericht(p_aanbod, v_id, v_a.gebruiker_id,
    'Ik wil dit graag kopen (betalen: ' || p_betaalwijze || ', ' || replace(p_levering, '_', ' ') || ')' ||
    case when coalesce(trim(p_bericht), '') <> '' then '. ' || left(trim(p_bericht), 1000) else '' end);
  return jsonb_build_object('ok', true, 'id', v_best);
end; $$;

-- Webshop: geen kopersbescherming voor de koper, wel commissie voor de verkoper.
create or replace function public.stripe_bestelling(p_id bigint)
returns jsonb language sql security definer set search_path to '' as $$
  select jsonb_build_object('id', b.id, 'titel', b.titel, 'bedrag', b.bedrag,
                            'kosten', case when b.webshop then 0 else private.kosten(b.bedrag) end,
                            'commissie', coalesce(b.commissie, 0), 'webshop', b.webshop,
                            'status', b.status, 'betaalwijze', b.betaalwijze, 'koper', b.koper, 'verkoper', b.verkoper,
                            'stripe_betaling', b.stripe_betaling, 'uitbetaald', b.uitbetaald,
                            'verkoper_account', g.stripe_account, 'verkoper_klaar', g.stripe_klaar)
  from private.bestellingen b join private.gebruikers g on g.id = b.verkoper where b.id = p_id
$$;

-- Webshopproducten met voorraad blijven online na een verkoop.
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
  update private.aanbod set actief = false where id = b.aanbod_id and soort = 'product' and voorraad is null;
  return jsonb_build_object('bedrag', b.bedrag, 'verkoper', b.verkoper, 'stripe_betaling', b.stripe_betaling);
end; $$;

create or replace function public.mijn_bestellingen(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  perform private.webshop_opruimen();
  return jsonb_build_object('bestellingen', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', b.id, 'aanbod_id', b.aanbod_id, 'titel', b.titel, 'bedrag', b.bedrag, 'betaalwijze', b.betaalwijze,
      'kosten', case when b.betaalwijze = 'app' then coalesce(b.kosten, private.kosten(b.bedrag)) end,
      'levering', b.levering, 'status', b.status, 'aangemaakt', b.aangemaakt, 'bijgewerkt', b.bijgewerkt,
      'uitbetaald', b.uitbetaald, 'webshop', b.webshop, 'aantal', b.aantal, 'verzendkosten', b.verzendkosten,
      'commissie', case when b.verkoper = v_id then b.commissie end,
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

create or replace function public.verkoop_overzicht(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object(
    'maanden', coalesce((select jsonb_agg(m order by m.maand) from (
        select to_char(date_trunc('month', bijgewerkt), 'YYYY-MM') as maand, count(*) as aantal, sum(bedrag) as omzet,
               coalesce(sum(commissie), 0) as commissie
        from private.bestellingen
        where verkoper = v_id and status = 'afgerond' and bijgewerkt > date_trunc('month', now()) - interval '11 months'
        group by 1) m), '[]'::jsonb),
    'top', coalesce((select jsonb_agg(t) from (
        select titel, count(*) as aantal, sum(bedrag) as omzet from private.bestellingen
        where verkoper = v_id and status = 'afgerond' group by titel order by sum(bedrag) desc limit 5) t), '[]'::jsonb),
    'klanten', coalesce((select jsonb_agg(k) from (
        select private.weergave(koper) as naam, count(*) as aantal, sum(bedrag) as totaal, max(bijgewerkt) as laatst
        from private.bestellingen where verkoper = v_id and status = 'afgerond'
        group by koper order by max(bijgewerkt) desc limit 50) k), '[]'::jsonb),
    'facturen', coalesce((select jsonb_agg(f order by f.datum desc) from (
        select id, titel, bedrag, levering, betaalwijze, bijgewerkt as datum, private.weergave(koper) as klant,
               aantal, verzendkosten, webshop, commissie
        from private.bestellingen where verkoper = v_id and status in ('betaald', 'geleverd', 'afgerond')
          and bijgewerkt > now() - interval '24 months') f), '[]'::jsonb),
    'open', (select count(*) from private.bestellingen
             where verkoper = v_id and status in ('aangevraagd', 'geaccepteerd', 'betaald', 'geleverd', 'geschil')),
    'actief_aanbod', (select count(*) from private.aanbod where gebruiker_id = v_id and actief),
    'max_aanbod', private.max_aanbod(v_id),
    'commissie_totaal', (select coalesce(sum(commissie), 0) from private.bestellingen
                         where verkoper = v_id and webshop and status = 'afgerond'),
    'beoordeling', private.vertrouwen(v_id));
end; $$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function public.mijn_winkel(text, text), public.winkel_instellen(text, text, text, text, text, text, numeric, numeric, text, boolean),
  public.winkel_product(text, text, bigint, boolean, integer), public.winkel_bekijken(text),
  public.webshop_bestellen(text, text, bigint, integer, text, text) from public;
grant execute on function public.mijn_winkel(text, text), public.winkel_instellen(text, text, text, text, text, text, numeric, numeric, text, boolean),
  public.winkel_product(text, text, bigint, boolean, integer), public.winkel_bekijken(text),
  public.webshop_bestellen(text, text, bigint, integer, text, text), public.bestellen(text, text, bigint, text, text, text),
  public.mijn_bestellingen(text, text), public.verkoop_overzicht(text, text)
  to anon, authenticated;
revoke execute on function public.stripe_bestelling(bigint), public.stripe_vrijgeven(bigint, bigint)
  from public, anon, authenticated;
grant execute on function public.stripe_bestelling(bigint), public.stripe_vrijgeven(bigint, bigint) to service_role;

-- --- Winkelstraat: alle open winkels in de app ---------------------------------------------

create or replace function public.winkels_zoeken(p_zoekterm text)
returns jsonb language sql stable security definer set search_path to '' as $$
  select coalesce(jsonb_agg(x order by x->>'naam'), '[]'::jsonb) from (
    select private.winkel_json(w) || jsonb_build_object(
      'verkoper', private.weergave(w.gebruiker_id),
      'vertrouwen', private.vertrouwen(w.gebruiker_id),
      'producten', (select count(*) from private.aanbod a where a.gebruiker_id = w.gebruiker_id and a.in_winkel
                    and not a.geblokkeerd and a.actief and coalesce(a.voorraad, 1) > 0)) as x
    from private.winkels w join private.gebruikers g on g.id = w.gebruiker_id
    where w.open and not g.geblokkeerd and not g.verwijderd
      and (coalesce(trim(p_zoekterm), '') = ''
           or w.naam ilike '%' || trim(p_zoekterm) || '%' or w.omschrijving ilike '%' || trim(p_zoekterm) || '%'
           or exists (select 1 from private.aanbod a where a.gebruiker_id = w.gebruiker_id and a.in_winkel
                      and a.titel ilike '%' || trim(p_zoekterm) || '%'))
    limit 200) s
$$;

revoke all on function public.winkels_zoeken(text) from public;
grant execute on function public.winkels_zoeken(text) to anon, authenticated;
