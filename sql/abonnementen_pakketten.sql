-- Cursussen en trainingen in een community: abonnementen per maand of per jaar, en pakketten (een paar cursussen
-- samen voor één prijs, eenmalig). Bouwt op sql/community_aanbod.sql. Alleen toevoegen of vervangen, niets weggooien.
--
-- * Een abonnement (plan) heeft nu een periode: maand of jaar. Wie al een abonnement heeft, houdt zijn periode en prijs.
-- * Een cursus kan ook een training heten (soort); verder werkt alles hetzelfde.
-- * Een pakket geeft na betaling toegang tot alle cursussen erin, voor altijd, net als een gekochte cursus. Wie een
--   cursus uit het pakket al had, houdt die gewoon; het pakket laat zien welke je al hebt.

alter table private.community_plannen add column if not exists periode text not null default 'maand';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'community_plannen_periode') then
    alter table private.community_plannen add constraint community_plannen_periode check (periode in ('maand', 'jaar'));
  end if;
end $$;

alter table private.community_cursussen add column if not exists soort text not null default 'cursus';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'community_cursussen_soort') then
    alter table private.community_cursussen add constraint community_cursussen_soort check (soort in ('cursus', 'training'));
  end if;
end $$;

create table if not exists private.cursus_pakketten (
  id bigint generated always as identity primary key,
  community bigint not null references private.chat_communities(id),
  titel text not null,
  omschrijving text not null default '',
  prijs_cent integer not null check (prijs_cent between 100 and 500000),
  cursussen bigint[] not null default '{}',
  gepubliceerd boolean not null default false,
  aangemaakt timestamptz not null default now(),
  weg boolean not null default false
);
create index if not exists cursus_pakketten_community on private.cursus_pakketten (community) where not weg;

-- Elke aankoop één keer (de betaalsessie van Stripe is de sleutel), ook als de webhook en de app allebei melden.
create table if not exists private.pakket_aankopen (
  stripe_sessie text primary key,
  pakket bigint not null references private.cursus_pakketten(id),
  gebruiker bigint not null references private.gebruikers(id),
  bedrag_cent integer not null default 0,
  stripe_betaling text,
  aangemaakt timestamptz not null default now()
);
create index if not exists pakket_aankopen_gebruiker on private.pakket_aankopen (gebruiker);

alter table private.cursus_pakketten enable row level security;
alter table private.pakket_aankopen enable row level security;
revoke all on private.cursus_pakketten, private.pakket_aankopen from public, anon, authenticated;

-- Alleen gepubliceerde cursussen van dezelfde community tellen mee in een pakket.
create or replace function private.pakket_json(k private.cursus_pakketten, p_ik bigint)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('id', k.id, 'titel', k.titel, 'omschrijving', k.omschrijving, 'prijs_cent', k.prijs_cent,
    'gepubliceerd', k.gepubliceerd,
    'cursussen', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'titel', c.titel, 'soort', c.soort,
        'prijs_cent', c.prijs_cent, 'toegang', private.cursus_mag_lezen(p_ik, c)) order by array_position(k.cursussen, c.id))
      from private.community_cursussen c
      where c.id = any (k.cursussen) and c.community = k.community and not c.weg
        and (c.gepubliceerd or private.cursus_beheer(p_ik, k.community))), '[]'::jsonb),
    'gekocht', exists (select 1 from private.pakket_aankopen a where a.pakket = k.id and a.gebruiker = p_ik),
    'kopers', case when private.cursus_beheer(p_ik, k.community)
                   then (select count(*) from private.pakket_aankopen a where a.pakket = k.id) end)
$$;

create or replace function private.cursus_json(c private.community_cursussen, p_ik bigint)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('id', c.id, 'community', c.community, 'titel', c.titel, 'omschrijving', c.omschrijving,
    'soort', c.soort, 'prijs_cent', c.prijs_cent, 'voor_abonnees', c.voor_abonnees, 'gepubliceerd', c.gepubliceerd,
    'toegang', private.cursus_mag_lezen(p_ik, c),
    'gekocht', exists (select 1 from private.cursus_toegang t where t.cursus = c.id and t.gebruiker = p_ik),
    'lessen', (select count(*) from private.cursus_lessen l where l.cursus = c.id and not l.weg),
    'minuten', (select coalesce(sum(l.minuten), 0) from private.cursus_lessen l where l.cursus = c.id and not l.weg),
    'klaar', (select count(*) from private.cursus_voortgang v join private.cursus_lessen l on l.id = v.les
              where v.gebruiker = p_ik and v.klaar and l.cursus = c.id and not l.weg),
    'kopers', case when private.cursus_beheer(p_ik, c.community)
                   then (select count(*) from private.cursus_toegang t where t.cursus = c.id and t.bron = 'gekocht') end)
$$;

-- Alles wat een community aanbiedt, voor een lid. De eigenaar ziet ook concepten, kopers en abonnees.
create or replace function public.community_aanbod(p_naam text, p_wachtwoord text, p_community bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_rol text; v_beheer boolean; c private.chat_communities;
        v_eigenaar private.gebruikers;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into c from private.chat_communities where id = p_community and not weg;
  v_rol := private.chat_community_rol(v_id, p_community);
  if c.id is null or (v_rol is null and not exists (
      select 1 from private.cursus_toegang t join private.community_cursussen k on k.id = t.cursus
      where t.gebruiker = v_id and k.community = p_community)) then
    return jsonb_build_object('fout', 'Je bent geen lid van deze community.');
  end if;
  v_beheer := coalesce(v_rol = 'eigenaar', false);
  select * into v_eigenaar from private.gebruikers where id = c.maker;
  return jsonb_build_object('id', c.id, 'naam', c.naam, 'rol', v_rol, 'beheer', v_beheer,
    'eigenaar', private.weergave(c.maker), 'zakelijk', v_eigenaar.niveau = 'ondernemer',
    'kan_ontvangen', coalesce(v_eigenaar.stripe_klaar, false),
    'aangemeld', v_beheer and v_eigenaar.stripe_account is not null,
    'cursussen', coalesce((select jsonb_agg(private.cursus_json(k, v_id) order by k.gepubliceerd desc, k.id)
      from private.community_cursussen k where k.community = c.id and private.cursus_zichtbaar(v_id, k)), '[]'::jsonb),
    'pakketten', coalesce((select jsonb_agg(private.pakket_json(k, v_id) order by k.gepubliceerd desc, k.prijs_cent)
      from private.cursus_pakketten k where k.community = c.id and not k.weg
        and (k.gepubliceerd or v_beheer
             or exists (select 1 from private.pakket_aankopen a where a.pakket = k.id and a.gebruiker = v_id))), '[]'::jsonb),
    'plannen', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'naam', p.naam, 'prijs_cent', p.prijs_cent,
        'periode', p.periode, 'voordelen', p.voordelen, 'actief', p.actief,
        'abonnees', case when v_beheer then (select count(*) from private.community_abonnees a where a.plan = p.id
                                             and a.status in ('active', 'trialing', 'past_due')) end)
        order by p.periode, p.prijs_cent)
      from private.community_plannen p where p.community = c.id and (p.actief or v_beheer)), '[]'::jsonb),
    'abonnement', (select jsonb_build_object('plan', a.plan, 'naam', p.naam, 'periode', p.periode, 'status', a.status,
        'tot', a.tot, 'opzeggen', a.opzeggen)
      from private.community_abonnees a join private.community_plannen p on p.id = a.plan
      where a.gebruiker = v_id and p.community = c.id and a.status in ('active', 'trialing', 'past_due')
      order by a.bijgewerkt desc limit 1));
end; $$;

-- Je cursussen in al je community's (om verder te gaan) en je lopende abonnementen, ook van community's waar je
-- niet meer in zit, zodat je altijd kunt opzeggen.
create or replace function public.mijn_cursussen(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object(
    'communities', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'naam', c.naam,
        'beheer', m.rol = 'eigenaar',
        'cursussen', (select count(*) from private.community_cursussen k where k.community = c.id and not k.weg
                      and (k.gepubliceerd or m.rol = 'eigenaar')),
        'plannen', (select count(*) from private.community_plannen p where p.community = c.id and p.actief))
        order by c.naam)
      from private.chat_communities c join private.chat_community_leden m on m.community = c.id
      where m.gebruiker = v_id and m.status = 'lid' and not c.weg), '[]'::jsonb),
    'bezig', coalesce((select jsonb_agg(private.cursus_json(k, v_id) || jsonb_build_object('community_naam', c.naam)
        order by v.laatst desc)
      from (select l.cursus, max(v.klaar_op) laatst from private.cursus_voortgang v
            join private.cursus_lessen l on l.id = v.les where v.gebruiker = v_id group by l.cursus) v
      join private.community_cursussen k on k.id = v.cursus
      join private.chat_communities c on c.id = k.community
      where private.cursus_mag_lezen(v_id, k)), '[]'::jsonb),
    'gekocht', coalesce((select jsonb_agg(private.cursus_json(k, v_id) || jsonb_build_object('community_naam', c.naam)
        order by t.aangemaakt desc)
      from private.cursus_toegang t join private.community_cursussen k on k.id = t.cursus
      join private.chat_communities c on c.id = k.community
      where t.gebruiker = v_id and not k.weg), '[]'::jsonb),
    'abonnementen', coalesce((select jsonb_agg(jsonb_build_object('plan', p.id, 'naam', p.naam, 'prijs_cent', p.prijs_cent,
        'periode', p.periode, 'community', c.id, 'community_naam', c.naam, 'status', a.status, 'tot', a.tot,
        'opzeggen', a.opzeggen)
        order by c.naam)
      from private.community_abonnees a join private.community_plannen p on p.id = a.plan
      join private.chat_communities c on c.id = p.community
      where a.gebruiker = v_id and a.status in ('active', 'trialing', 'past_due', 'incomplete')), '[]'::jsonb));
end; $$;

-- Een cursus of training opslaan, met de soort erbij (de oude versie zonder soort blijft werken).
create or replace function public.cursus_opslaan(p_naam text, p_wachtwoord text, p_community bigint, p_cursus bigint,
                                                 p_titel text, p_omschrijving text, p_prijs_cent integer,
                                                 p_voor_abonnees boolean, p_gepubliceerd boolean, p_soort text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare r jsonb;
begin
  if coalesce(p_soort, 'cursus') not in ('cursus', 'training') then
    return jsonb_build_object('fout', 'Kies cursus of training.');
  end if;
  r := public.cursus_opslaan(p_naam, p_wachtwoord, p_community, p_cursus, p_titel, p_omschrijving, p_prijs_cent,
                             p_voor_abonnees, p_gepubliceerd);
  if (r ->> 'id') is not null then
    update private.community_cursussen set soort = coalesce(p_soort, 'cursus') where id = (r ->> 'id')::bigint;
  end if;
  return r;
end; $$;

-- Een abonnement per maand of per jaar. Een nieuwe prijs of periode geldt voor nieuwe abonnees.
create or replace function public.plan_opslaan(p_naam text, p_wachtwoord text, p_community bigint, p_plan bigint,
                                               p_titel text, p_prijs_cent integer, p_voordelen text, p_actief boolean,
                                               p_periode text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_c bigint; v_plan bigint;
        v_periode text := coalesce(p_periode, 'maand');
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if v_periode not in ('maand', 'jaar') then return jsonb_build_object('fout', 'Kies per maand of per jaar.'); end if;
  v_c := coalesce((select community from private.community_plannen where id = p_plan), p_community);
  if v_c is null or not private.cursus_beheer(v_id, v_c) then
    return jsonb_build_object('fout', 'Alleen de eigenaar van de community kan abonnementen maken.');
  end if;
  if trim(coalesce(p_titel, '')) = '' then return jsonb_build_object('fout', 'Geef het abonnement een naam.'); end if;
  if v_periode = 'maand' and coalesce(p_prijs_cent, 0) not between 100 and 50000 then
    return jsonb_build_object('fout', 'Kies een prijs tussen € 1 en € 500 per maand.');
  end if;
  if v_periode = 'jaar' and coalesce(p_prijs_cent, 0) not between 100 and 500000 then
    return jsonb_build_object('fout', 'Kies een prijs tussen € 1 en € 5.000 per jaar.');
  end if;
  if coalesce(p_actief, true) and not (select stripe_klaar from private.gebruikers where id = v_id) then
    return jsonb_build_object('fout', 'Om abonnementen te verkopen, zet je eerst betalingen aan in Instellingen › Betalingen.');
  end if;
  if p_plan is null then
    if (select count(*) from private.community_plannen where community = v_c and actief) >= 6 then
      return jsonb_build_object('fout', 'Een community kan maximaal 6 abonnementen tegelijk hebben.');
    end if;
    insert into private.community_plannen (community, naam, prijs_cent, voordelen, actief, periode)
    values (v_c, left(trim(p_titel), 60), p_prijs_cent, left(coalesce(p_voordelen, ''), 1000), coalesce(p_actief, true),
            v_periode)
    returning id into v_plan;
  else
    update private.community_plannen set naam = left(trim(p_titel), 60), prijs_cent = p_prijs_cent,
      voordelen = left(coalesce(p_voordelen, ''), 1000), actief = coalesce(p_actief, true), periode = v_periode
    where id = p_plan returning id into v_plan;
  end if;
  return jsonb_build_object('ok', true, 'id', v_plan);
end; $$;

-- Een pakket: een paar cursussen of trainingen van deze community samen, voor één prijs.
create or replace function public.pakket_opslaan(p_naam text, p_wachtwoord text, p_community bigint, p_pakket bigint,
                                                 p_titel text, p_omschrijving text, p_prijs_cent integer,
                                                 p_cursussen bigint[], p_gepubliceerd boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_c bigint; v_lijst bigint[]; v_pakket bigint;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  v_c := coalesce((select community from private.cursus_pakketten where id = p_pakket and not weg), p_community);
  if v_c is null or not private.cursus_beheer(v_id, v_c) then
    return jsonb_build_object('fout', 'Alleen de eigenaar van de community kan pakketten maken.');
  end if;
  if trim(coalesce(p_titel, '')) = '' then return jsonb_build_object('fout', 'Geef het pakket een naam.'); end if;
  if coalesce(p_prijs_cent, 0) not between 100 and 500000 then
    return jsonb_build_object('fout', 'Kies een prijs tussen € 1 en € 5.000.');
  end if;
  select coalesce(array_agg(id order by array_position(p_cursussen, id)), '{}') into v_lijst
  from private.community_cursussen where id = any (coalesce(p_cursussen, '{}')) and community = v_c and not weg;
  if cardinality(v_lijst) < 2 then
    return jsonb_build_object('fout', 'Kies minstens twee cursussen of trainingen voor een pakket.');
  end if;
  if coalesce(p_gepubliceerd, false) and not (select stripe_klaar from private.gebruikers where id = v_id) then
    return jsonb_build_object('fout', 'Om een pakket te verkopen, zet je eerst betalingen aan in Instellingen › Betalingen.');
  end if;
  if p_pakket is null then
    if (select count(*) from private.cursus_pakketten where community = v_c and not weg) >= 20 then
      return jsonb_build_object('fout', 'Een community kan maximaal 20 pakketten hebben.');
    end if;
    insert into private.cursus_pakketten (community, titel, omschrijving, prijs_cent, cursussen, gepubliceerd)
    values (v_c, left(trim(p_titel), 100), left(coalesce(p_omschrijving, ''), 2000), p_prijs_cent, v_lijst,
            coalesce(p_gepubliceerd, false))
    returning id into v_pakket;
  else
    update private.cursus_pakketten set titel = left(trim(p_titel), 100), omschrijving = left(coalesce(p_omschrijving, ''), 2000),
      prijs_cent = p_prijs_cent, cursussen = v_lijst, gepubliceerd = coalesce(p_gepubliceerd, false)
    where id = p_pakket returning id into v_pakket;
  end if;
  return jsonb_build_object('ok', true, 'id', v_pakket);
end; $$;

-- Weghalen verbergt het pakket; wie het kocht, houdt toegang tot de cursussen.
create or replace function public.pakket_weg(p_naam text, p_wachtwoord text, p_pakket bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_c bigint;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select community into v_c from private.cursus_pakketten where id = p_pakket and not weg;
  if v_c is null or not private.cursus_beheer(v_id, v_c) then return jsonb_build_object('fout', 'Niet gevonden.'); end if;
  update private.cursus_pakketten set weg = true, gepubliceerd = false where id = p_pakket;
  return jsonb_build_object('ok', true);
end; $$;

-- --- Voor de betaalfunctie (alleen service_role) ---------------------------------------------------------------

create or replace function public.stripe_community_plan(p_plan bigint, p_gebruiker bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare p private.community_plannen; e private.gebruikers;
begin
  select * into p from private.community_plannen where id = p_plan and actief;
  if p.id is null or private.chat_community_rol(p_gebruiker, p.community) is null then return null; end if;
  select g.* into e from private.chat_communities m join private.gebruikers g on g.id = m.maker
  where m.id = p.community and not m.weg;
  if e.id is null then return null; end if;
  return jsonb_build_object('id', p.id, 'naam', p.naam, 'prijs_cent', p.prijs_cent, 'periode', p.periode,
    'community', p.community, 'community_naam', (select naam from private.chat_communities where id = p.community),
    'account', e.stripe_account, 'klaar', e.stripe_klaar, 'eigen', e.id = p_gebruiker,
    'al', private.community_abonnee(p_gebruiker, p.community),
    'procent', (select commissie_procent from private.platform where id = 1));
end; $$;

create or replace function public.stripe_pakket(p_pakket bigint, p_gebruiker bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare k private.cursus_pakketten; e private.gebruikers;
begin
  select * into k from private.cursus_pakketten where id = p_pakket and not weg and gepubliceerd;
  if k.id is null or private.chat_community_rol(p_gebruiker, k.community) is null then return null; end if;
  select g.* into e from private.chat_communities m join private.gebruikers g on g.id = m.maker
  where m.id = k.community and not m.weg;
  if e.id is null then return null; end if;
  return jsonb_build_object('id', k.id, 'titel', k.titel, 'prijs_cent', k.prijs_cent, 'community', k.community,
    'account', e.stripe_account, 'klaar', e.stripe_klaar, 'eigen', e.id = p_gebruiker,
    'al', exists (select 1 from private.pakket_aankopen a where a.pakket = k.id and a.gebruiker = p_gebruiker),
    'commissie_cent', round(private.commissie(k.prijs_cent / 100.0) * 100)::int);
end; $$;

create or replace function public.stripe_pakket_gekocht(p_pakket bigint, p_gebruiker bigint, p_sessie text,
                                                        p_betaling text, p_bedrag integer)
returns boolean language plpgsql security definer set search_path to '' as $$
declare k private.cursus_pakketten; v_eigenaar bigint; v_commissie int;
begin
  select * into k from private.cursus_pakketten where id = p_pakket;
  if k.id is null or not exists (select 1 from private.gebruikers where id = p_gebruiker) then return false; end if;
  insert into private.pakket_aankopen (stripe_sessie, pakket, gebruiker, bedrag_cent, stripe_betaling)
  values (p_sessie, k.id, p_gebruiker, coalesce(p_bedrag, 0), p_betaling)
  on conflict (stripe_sessie) do nothing;
  if not found then return true; end if;
  insert into private.cursus_toegang (cursus, gebruiker, bron, bedrag_cent)
  select c.id, p_gebruiker, 'gekocht', 0 from private.community_cursussen c
  where c.id = any (k.cursussen) and c.community = k.community
  on conflict (cursus, gebruiker) do nothing;
  select maker into v_eigenaar from private.chat_communities where id = k.community;
  v_commissie := round(private.commissie(coalesce(p_bedrag, 0) / 100.0) * 100)::int;
  insert into private.zaak_posten (gebruiker_id, klant_id, klant, soort, bedrag, omschrijving)
  values (v_eigenaar, p_gebruiker, private.weergave(p_gebruiker), 'betaling', coalesce(p_bedrag, 0),
          'Pakket: ' || k.titel || ' (via de app)');
  if v_commissie > 0 then
    insert into private.zaak_posten (gebruiker_id, soort, bedrag, btw, omschrijving, categorie)
    values (v_eigenaar, 'kosten', v_commissie, 0, 'Commissie betalen via de app', 'Betaalkosten');
  end if;
  return true;
end; $$;

revoke all on function private.pakket_json(private.cursus_pakketten, bigint) from public, anon, authenticated;
revoke all on function public.cursus_opslaan(text, text, bigint, bigint, text, text, integer, boolean, boolean, text),
  public.plan_opslaan(text, text, bigint, bigint, text, integer, text, boolean, text),
  public.pakket_opslaan(text, text, bigint, bigint, text, text, integer, bigint[], boolean),
  public.pakket_weg(text, text, bigint) from public;
grant execute on function public.cursus_opslaan(text, text, bigint, bigint, text, text, integer, boolean, boolean, text),
  public.plan_opslaan(text, text, bigint, bigint, text, integer, text, boolean, text),
  public.pakket_opslaan(text, text, bigint, bigint, text, text, integer, bigint[], boolean),
  public.pakket_weg(text, text, bigint) to anon, authenticated;
revoke all on function public.stripe_pakket(bigint, bigint), public.stripe_pakket_gekocht(bigint, bigint, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.stripe_pakket(bigint, bigint), public.stripe_pakket_gekocht(bigint, bigint, text, text, integer)
  to service_role;
