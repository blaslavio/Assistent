-- Cursussen en abonnementen in een community (bouwt op sql/chat_community.sql, sql/stripe.sql en sql/webshop.sql).
--
-- De eigenaar van een community maakt cursussen met lessen (tekst en eventueel een video). Een cursus is gratis voor
-- alle leden, te koop (eenmalig), of inbegrepen bij een abonnement op de community (per maand). Leden volgen de
-- cursus in de app en zien hun voortgang. De inhoud van een cursus geeft de server alleen aan wie toegang heeft.
-- Betalen gaat via Stripe naar de eigenaar (die zich daarvoor eerst bij Stripe aanmeldt), min de commissie van het
-- platform (zie private.commissie). Wie een cursus kocht, houdt toegang, ook als de eigenaar hem later verbergt.
-- Alleen toevoegen of vervangen, niets weggooien.

create table if not exists private.community_cursussen (
  id bigint generated always as identity primary key,
  community bigint not null references private.chat_communities(id),
  maker bigint not null references private.gebruikers(id),
  titel text not null,
  omschrijving text not null default '',
  prijs_cent integer not null default 0 check (prijs_cent = 0 or prijs_cent between 100 and 100000),
  voor_abonnees boolean not null default false,
  gepubliceerd boolean not null default false,
  aangemaakt timestamptz not null default now(),
  bijgewerkt timestamptz not null default now(),
  weg boolean not null default false
);
create index if not exists community_cursussen_community on private.community_cursussen (community) where not weg;

create table if not exists private.cursus_lessen (
  id bigint generated always as identity primary key,
  cursus bigint not null references private.community_cursussen(id),
  positie integer not null default 0,
  titel text not null,
  inhoud text not null default '',
  video text not null default '',
  minuten integer not null default 0 check (minuten between 0 and 600),
  bijgewerkt timestamptz not null default now(),
  weg boolean not null default false
);
create index if not exists cursus_lessen_cursus on private.cursus_lessen (cursus, positie) where not weg;

-- Wie een cursus mag volgen zonder lid-zijn of abonnement: gekocht (of door de eigenaar cadeau gedaan).
create table if not exists private.cursus_toegang (
  cursus bigint not null references private.community_cursussen(id),
  gebruiker bigint not null references private.gebruikers(id),
  bron text not null check (bron in ('gekocht', 'cadeau')),
  bedrag_cent integer not null default 0,
  stripe_sessie text,
  stripe_betaling text,
  aangemaakt timestamptz not null default now(),
  primary key (cursus, gebruiker)
);
create unique index if not exists cursus_toegang_sessie on private.cursus_toegang (stripe_sessie) where stripe_sessie is not null;

create table if not exists private.cursus_voortgang (
  gebruiker bigint not null references private.gebruikers(id),
  les bigint not null references private.cursus_lessen(id),
  klaar_op timestamptz not null default now(),
  klaar boolean not null default true,
  primary key (gebruiker, les)
);

create table if not exists private.community_plannen (
  id bigint generated always as identity primary key,
  community bigint not null references private.chat_communities(id),
  naam text not null,
  prijs_cent integer not null check (prijs_cent between 100 and 50000),
  voordelen text not null default '',
  actief boolean not null default true,
  aangemaakt timestamptz not null default now()
);
create index if not exists community_plannen_community on private.community_plannen (community);

create table if not exists private.community_abonnees (
  stripe_abonnement text primary key,
  plan bigint not null references private.community_plannen(id),
  gebruiker bigint not null references private.gebruikers(id),
  status text not null,
  tot timestamptz,
  opzeggen boolean not null default false,
  bijgewerkt timestamptz not null default now()
);
create index if not exists community_abonnees_gebruiker on private.community_abonnees (gebruiker);
create index if not exists community_abonnees_plan on private.community_abonnees (plan);

alter table private.community_cursussen enable row level security;
alter table private.cursus_lessen enable row level security;
alter table private.cursus_toegang enable row level security;
alter table private.cursus_voortgang enable row level security;
alter table private.community_plannen enable row level security;
alter table private.community_abonnees enable row level security;

-- Een lopend abonnement (ook als de laatste betaling even mislukte: Stripe probeert het dan nog een paar keer).
create or replace function private.community_abonnee(p_gebruiker bigint, p_community bigint)
returns boolean language sql stable security definer set search_path to '' as $$
  select exists (select 1 from private.community_abonnees a join private.community_plannen p on p.id = a.plan
                 where a.gebruiker = p_gebruiker and p.community = p_community
                   and a.status in ('active', 'trialing', 'past_due') and (a.tot is null or a.tot > now() - interval '2 days'))
$$;

create or replace function private.cursus_beheer(p_gebruiker bigint, p_community bigint)
returns boolean language sql stable security definer set search_path to '' as $$
  select coalesce(private.chat_community_rol(p_gebruiker, p_community) = 'eigenaar', false)
$$;

-- Mag de inhoud lezen: de eigenaar; wie hem kocht; en verder leden als hij gepubliceerd is en gratis is of
-- inbegrepen bij hun abonnement.
create or replace function private.cursus_mag_lezen(p_gebruiker bigint, c private.community_cursussen)
returns boolean language sql stable security definer set search_path to '' as $$
  select not c.weg and (
    private.cursus_beheer(p_gebruiker, c.community)
    or exists (select 1 from private.cursus_toegang t where t.cursus = c.id and t.gebruiker = p_gebruiker)
    or (c.gepubliceerd and private.chat_community_rol(p_gebruiker, c.community) is not null
        and ((c.prijs_cent = 0 and not c.voor_abonnees)
             or (c.voor_abonnees and private.community_abonnee(p_gebruiker, c.community)))))
$$;

-- Zien dat de cursus er is (titel, prijs, lessen): leden bij gepubliceerde cursussen, en wie er toegang toe heeft.
create or replace function private.cursus_zichtbaar(p_gebruiker bigint, c private.community_cursussen)
returns boolean language sql stable security definer set search_path to '' as $$
  select not c.weg and (
    private.cursus_beheer(p_gebruiker, c.community)
    or exists (select 1 from private.cursus_toegang t where t.cursus = c.id and t.gebruiker = p_gebruiker)
    or (c.gepubliceerd and private.chat_community_rol(p_gebruiker, c.community) is not null))
$$;

create or replace function private.cursus_json(c private.community_cursussen, p_ik bigint)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('id', c.id, 'community', c.community, 'titel', c.titel, 'omschrijving', c.omschrijving,
    'prijs_cent', c.prijs_cent, 'voor_abonnees', c.voor_abonnees, 'gepubliceerd', c.gepubliceerd,
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
    'plannen', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'naam', p.naam, 'prijs_cent', p.prijs_cent,
        'voordelen', p.voordelen, 'actief', p.actief,
        'abonnees', case when v_beheer then (select count(*) from private.community_abonnees a where a.plan = p.id
                                             and a.status in ('active', 'trialing', 'past_due')) end)
        order by p.prijs_cent)
      from private.community_plannen p where p.community = c.id and (p.actief or v_beheer)), '[]'::jsonb),
    'abonnement', (select jsonb_build_object('plan', a.plan, 'naam', p.naam, 'status', a.status, 'tot', a.tot,
        'opzeggen', a.opzeggen)
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
        'community', c.id, 'community_naam', c.naam, 'status', a.status, 'tot', a.tot, 'opzeggen', a.opzeggen)
        order by c.naam)
      from private.community_abonnees a join private.community_plannen p on p.id = a.plan
      join private.chat_communities c on c.id = p.community
      where a.gebruiker = v_id and a.status in ('active', 'trialing', 'past_due', 'incomplete')), '[]'::jsonb));
end; $$;

create or replace function public.cursus_opslaan(p_naam text, p_wachtwoord text, p_community bigint, p_cursus bigint,
                                                 p_titel text, p_omschrijving text, p_prijs_cent integer,
                                                 p_voor_abonnees boolean, p_gepubliceerd boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_c bigint; v_prijs integer := coalesce(p_prijs_cent, 0);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if p_cursus is not null then
    select community into v_c from private.community_cursussen where id = p_cursus and not weg;
  else
    v_c := p_community;
  end if;
  if v_c is null or not private.cursus_beheer(v_id, v_c) then
    return jsonb_build_object('fout', 'Alleen de eigenaar van de community kan cursussen maken.');
  end if;
  if trim(coalesce(p_titel, '')) = '' then return jsonb_build_object('fout', 'Geef de cursus een titel.'); end if;
  if coalesce(p_voor_abonnees, false) then v_prijs := 0; end if;
  if v_prijs <> 0 and (v_prijs < 100 or v_prijs > 100000) then
    return jsonb_build_object('fout', 'Kies een prijs tussen € 1 en € 1.000, of maak de cursus gratis.');
  end if;
  if coalesce(p_gepubliceerd, false) and v_prijs > 0
     and not (select stripe_klaar from private.gebruikers where id = v_id) then
    return jsonb_build_object('fout', 'Om een cursus te verkopen, meld je je eerst aan om betalingen te ontvangen.');
  end if;
  if p_cursus is null then
    if (select count(*) from private.community_cursussen where community = v_c and not weg) >= 50 then
      return jsonb_build_object('fout', 'Een community kan maximaal 50 cursussen hebben.');
    end if;
    insert into private.community_cursussen (community, maker, titel, omschrijving, prijs_cent, voor_abonnees, gepubliceerd)
    values (v_c, v_id, left(trim(p_titel), 100), left(coalesce(p_omschrijving, ''), 2000), v_prijs,
            coalesce(p_voor_abonnees, false), coalesce(p_gepubliceerd, false))
    returning id into v_c;
    return jsonb_build_object('ok', true, 'id', v_c);
  end if;
  update private.community_cursussen set titel = left(trim(p_titel), 100), omschrijving = left(coalesce(p_omschrijving, ''), 2000),
    prijs_cent = v_prijs, voor_abonnees = coalesce(p_voor_abonnees, false), gepubliceerd = coalesce(p_gepubliceerd, false),
    bijgewerkt = now()
  where id = p_cursus;
  return jsonb_build_object('ok', true, 'id', p_cursus);
end; $$;

-- Weghalen kan alleen als niemand hem kocht; anders verberg je hem (kopers houden dan hun toegang).
create or replace function public.cursus_weg(p_naam text, p_wachtwoord text, p_cursus bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); c private.community_cursussen;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into c from private.community_cursussen where id = p_cursus and not weg;
  if c.id is null or not private.cursus_beheer(v_id, c.community) then return jsonb_build_object('fout', 'Geen toegang.'); end if;
  if exists (select 1 from private.cursus_toegang where cursus = c.id and bron = 'gekocht') then
    return jsonb_build_object('fout', 'Deze cursus is gekocht. Verberg hem in plaats daarvan: dan houden kopers hun toegang.');
  end if;
  update private.community_cursussen set weg = true, gepubliceerd = false, bijgewerkt = now() where id = c.id;
  return jsonb_build_object('ok', true);
end; $$;

create or replace function public.les_opslaan(p_naam text, p_wachtwoord text, p_cursus bigint, p_les bigint, p_titel text,
                                              p_inhoud text, p_video text, p_minuten integer)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); c private.community_cursussen; v_les bigint;
        v_video text := trim(coalesce(p_video, ''));
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if p_les is not null then
    select k.* into c from private.cursus_lessen l join private.community_cursussen k on k.id = l.cursus
    where l.id = p_les and not l.weg and not k.weg;
  else
    select * into c from private.community_cursussen where id = p_cursus and not weg;
  end if;
  if c.id is null or not private.cursus_beheer(v_id, c.community) then return jsonb_build_object('fout', 'Geen toegang.'); end if;
  if trim(coalesce(p_titel, '')) = '' then return jsonb_build_object('fout', 'Geef de les een titel.'); end if;
  if v_video <> '' and v_video !~ '^https://[^\s<>"]+$' then
    return jsonb_build_object('fout', 'Een video moet een link zijn die begint met https://.');
  end if;
  if length(coalesce(p_inhoud, '')) > 30000 then
    return jsonb_build_object('fout', 'Deze les is te lang. Verdeel hem over meer lessen.');
  end if;
  if p_les is null then
    if (select count(*) from private.cursus_lessen where cursus = c.id and not weg) >= 100 then
      return jsonb_build_object('fout', 'Een cursus kan maximaal 100 lessen hebben.');
    end if;
    insert into private.cursus_lessen (cursus, positie, titel, inhoud, video, minuten)
    values (c.id, coalesce((select max(positie) + 1 from private.cursus_lessen where cursus = c.id and not weg), 0),
            left(trim(p_titel), 120), coalesce(p_inhoud, ''), left(v_video, 500), least(600, greatest(0, coalesce(p_minuten, 0))))
    returning id into v_les;
  else
    update private.cursus_lessen set titel = left(trim(p_titel), 120), inhoud = coalesce(p_inhoud, ''),
      video = left(v_video, 500), minuten = least(600, greatest(0, coalesce(p_minuten, 0))), bijgewerkt = now()
    where id = p_les returning id into v_les;
  end if;
  update private.community_cursussen set bijgewerkt = now() where id = c.id;
  return jsonb_build_object('ok', true, 'id', v_les);
end; $$;

-- p_actie: weg, op (eerder) of neer (later).
create or replace function public.les_wijzigen(p_naam text, p_wachtwoord text, p_les bigint, p_actie text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); l private.cursus_lessen; c private.community_cursussen;
        v_ander private.cursus_lessen;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into l from private.cursus_lessen where id = p_les and not weg;
  select * into c from private.community_cursussen where id = l.cursus and not weg;
  if c.id is null or not private.cursus_beheer(v_id, c.community) then return jsonb_build_object('fout', 'Geen toegang.'); end if;
  if p_actie = 'weg' then
    update private.cursus_lessen set weg = true, bijgewerkt = now() where id = l.id;
  elsif p_actie in ('op', 'neer') then
    select * into v_ander from private.cursus_lessen where cursus = l.cursus and not weg and id <> l.id
      and case when p_actie = 'op' then (positie, id) < (l.positie, l.id) else (positie, id) > (l.positie, l.id) end
    order by case when p_actie = 'op' then positie end desc, case when p_actie = 'op' then id end desc,
             case when p_actie = 'neer' then positie end, case when p_actie = 'neer' then id end
    limit 1;
    if v_ander.id is null then return jsonb_build_object('ok', true); end if;
    -- Eerst alle posities op volgorde zetten (gelijke posities kunnen anders niet wisselen).
    update private.cursus_lessen x set positie = r.n from (
      select id, row_number() over (order by positie, id) * 2 n from private.cursus_lessen where cursus = l.cursus and not weg) r
    where x.id = r.id;
    update private.cursus_lessen x set positie = case when x.id = l.id then (select positie from private.cursus_lessen where id = v_ander.id)
                                                      else (select positie from private.cursus_lessen where id = l.id) end
    where x.id in (l.id, v_ander.id);
  else
    return jsonb_build_object('fout', 'Onbekende actie.');
  end if;
  return jsonb_build_object('ok', true);
end; $$;

-- Een cursus met zijn lessen. De inhoud alleen voor wie toegang heeft; anders alleen de titels (als voorproefje).
create or replace function public.cursus_lezen(p_naam text, p_wachtwoord text, p_cursus bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); c private.community_cursussen; v_lezen boolean;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into c from private.community_cursussen where id = p_cursus;
  if c.id is null or not private.cursus_zichtbaar(v_id, c) then
    return jsonb_build_object('fout', 'Deze cursus is er niet (meer).');
  end if;
  v_lezen := private.cursus_mag_lezen(v_id, c);
  return private.cursus_json(c, v_id) || jsonb_build_object(
    'community_naam', (select naam from private.chat_communities where id = c.community),
    'beheer', private.cursus_beheer(v_id, c.community),
    'les_lijst', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'titel', l.titel, 'minuten', l.minuten,
        'inhoud', case when v_lezen then l.inhoud end, 'video', case when v_lezen then l.video end,
        'klaar', coalesce((select v.klaar from private.cursus_voortgang v where v.gebruiker = v_id and v.les = l.id), false))
        order by l.positie, l.id)
      from private.cursus_lessen l where l.cursus = c.id and not l.weg), '[]'::jsonb));
end; $$;

create or replace function public.les_klaar(p_naam text, p_wachtwoord text, p_les bigint, p_klaar boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); c private.community_cursussen;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select k.* into c from private.cursus_lessen l join private.community_cursussen k on k.id = l.cursus
  where l.id = p_les and not l.weg;
  if c.id is null or not private.cursus_mag_lezen(v_id, c) then return jsonb_build_object('fout', 'Geen toegang.'); end if;
  insert into private.cursus_voortgang (gebruiker, les, klaar) values (v_id, p_les, coalesce(p_klaar, true))
  on conflict (gebruiker, les) do update set klaar = excluded.klaar, klaar_op = now();
  return jsonb_build_object('ok', true);
end; $$;

create or replace function public.plan_opslaan(p_naam text, p_wachtwoord text, p_community bigint, p_plan bigint,
                                               p_titel text, p_prijs_cent integer, p_voordelen text, p_actief boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_c bigint; v_plan bigint;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  v_c := coalesce((select community from private.community_plannen where id = p_plan), p_community);
  if v_c is null or not private.cursus_beheer(v_id, v_c) then
    return jsonb_build_object('fout', 'Alleen de eigenaar van de community kan abonnementen maken.');
  end if;
  if trim(coalesce(p_titel, '')) = '' then return jsonb_build_object('fout', 'Geef het abonnement een naam.'); end if;
  if coalesce(p_prijs_cent, 0) not between 100 and 50000 then
    return jsonb_build_object('fout', 'Kies een prijs tussen € 1 en € 500 per maand.');
  end if;
  if coalesce(p_actief, true) and not (select stripe_klaar from private.gebruikers where id = v_id) then
    return jsonb_build_object('fout', 'Om abonnementen te verkopen, meld je je eerst aan om betalingen te ontvangen.');
  end if;
  if p_plan is null then
    if (select count(*) from private.community_plannen where community = v_c and actief) >= 3 then
      return jsonb_build_object('fout', 'Een community kan maximaal 3 abonnementen tegelijk hebben.');
    end if;
    insert into private.community_plannen (community, naam, prijs_cent, voordelen, actief)
    values (v_c, left(trim(p_titel), 60), p_prijs_cent, left(coalesce(p_voordelen, ''), 1000), coalesce(p_actief, true))
    returning id into v_plan;
  else
    -- De prijs geldt voor nieuwe abonnees; wie al een abonnement heeft, houdt zijn prijs.
    update private.community_plannen set naam = left(trim(p_titel), 60), prijs_cent = p_prijs_cent,
      voordelen = left(coalesce(p_voordelen, ''), 1000), actief = coalesce(p_actief, true)
    where id = p_plan returning id into v_plan;
  end if;
  return jsonb_build_object('ok', true, 'id', v_plan);
end; $$;

-- --- Voor de betaalfunctie (alleen service_role) ---------------------------------------------------------------

create or replace function public.stripe_cursus(p_cursus bigint, p_gebruiker bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare c private.community_cursussen; e private.gebruikers;
begin
  select * into c from private.community_cursussen where id = p_cursus and not weg and gepubliceerd and prijs_cent > 0
    and not voor_abonnees;
  if c.id is null or private.chat_community_rol(p_gebruiker, c.community) is null then return null; end if;
  select g.* into e from private.chat_communities m join private.gebruikers g on g.id = m.maker where m.id = c.community;
  return jsonb_build_object('id', c.id, 'titel', c.titel, 'prijs_cent', c.prijs_cent, 'community', c.community,
    'account', e.stripe_account, 'klaar', e.stripe_klaar, 'eigen', e.id = p_gebruiker,
    'al', exists (select 1 from private.cursus_toegang where cursus = c.id and gebruiker = p_gebruiker),
    'commissie_cent', round(private.commissie(c.prijs_cent / 100.0) * 100)::int);
end; $$;

create or replace function public.stripe_cursus_gekocht(p_cursus bigint, p_gebruiker bigint, p_sessie text,
                                                        p_betaling text, p_bedrag integer)
returns boolean language plpgsql security definer set search_path to '' as $$
declare c private.community_cursussen; v_eigenaar bigint; v_commissie int;
begin
  select * into c from private.community_cursussen where id = p_cursus;
  if c.id is null then return false; end if;
  if exists (select 1 from private.cursus_toegang where stripe_sessie = p_sessie) then return true; end if;
  insert into private.cursus_toegang (cursus, gebruiker, bron, bedrag_cent, stripe_sessie, stripe_betaling)
  values (c.id, p_gebruiker, 'gekocht', coalesce(p_bedrag, 0), p_sessie, p_betaling)
  on conflict (cursus, gebruiker) do nothing;
  if not found then return true; end if;
  -- In de administratie van de verkoper (Zakelijk), net als een betaalde boeking.
  select maker into v_eigenaar from private.chat_communities where id = c.community;
  v_commissie := round(private.commissie(coalesce(p_bedrag, 0) / 100.0) * 100)::int;
  insert into private.zaak_posten (gebruiker_id, klant_id, klant, soort, bedrag, omschrijving)
  values (v_eigenaar, p_gebruiker, private.weergave(p_gebruiker), 'betaling', coalesce(p_bedrag, 0),
          'Cursus: ' || c.titel || ' (via de app)');
  if v_commissie > 0 then
    insert into private.zaak_posten (gebruiker_id, soort, bedrag, btw, omschrijving, categorie)
    values (v_eigenaar, 'kosten', v_commissie, 0, 'Commissie betalen via de app', 'Betaalkosten');
  end if;
  return true;
end; $$;

create or replace function public.stripe_community_plan(p_plan bigint, p_gebruiker bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare p private.community_plannen; e private.gebruikers;
begin
  select * into p from private.community_plannen where id = p_plan and actief;
  if p.id is null or private.chat_community_rol(p_gebruiker, p.community) is null then return null; end if;
  select g.* into e from private.chat_communities m join private.gebruikers g on g.id = m.maker
  where m.id = p.community and not m.weg;
  if e.id is null then return null; end if;
  return jsonb_build_object('id', p.id, 'naam', p.naam, 'prijs_cent', p.prijs_cent, 'community', p.community,
    'community_naam', (select naam from private.chat_communities where id = p.community),
    'account', e.stripe_account, 'klaar', e.stripe_klaar, 'eigen', e.id = p_gebruiker,
    'al', private.community_abonnee(p_gebruiker, p.community),
    'procent', (select commissie_procent from private.platform where id = 1));
end; $$;

create or replace function public.stripe_community_abonnement_opslaan(p_abonnement text, p_plan bigint, p_gebruiker bigint,
                                                                      p_status text, p_tot timestamptz, p_opzeggen boolean)
returns void language plpgsql security definer set search_path to '' as $$
begin
  if not exists (select 1 from private.community_plannen where id = p_plan)
     or not exists (select 1 from private.gebruikers where id = p_gebruiker) then
    return;
  end if;
  insert into private.community_abonnees (stripe_abonnement, plan, gebruiker, status, tot, opzeggen)
  values (p_abonnement, p_plan, p_gebruiker, left(coalesce(p_status, ''), 30), p_tot, coalesce(p_opzeggen, false))
  on conflict (stripe_abonnement) do update set status = excluded.status, tot = excluded.tot,
    opzeggen = excluded.opzeggen, bijgewerkt = now();
end; $$;

-- Je abonnementen op community's (om op te zeggen, of te stoppen bij het verwijderen van je account).
create or replace function public.stripe_community_abonnementen(p_gebruiker bigint)
returns jsonb language sql security definer set search_path to '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('stripe_abonnement', a.stripe_abonnement, 'plan', a.plan,
                                               'community', p.community, 'status', a.status)), '[]'::jsonb)
  from private.community_abonnees a join private.community_plannen p on p.id = a.plan
  where a.gebruiker = p_gebruiker and a.status not in ('canceled', 'incomplete_expired')
$$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function public.community_aanbod(text, text, bigint), public.mijn_cursussen(text, text),
  public.cursus_opslaan(text, text, bigint, bigint, text, text, integer, boolean, boolean),
  public.cursus_weg(text, text, bigint), public.les_opslaan(text, text, bigint, bigint, text, text, text, integer),
  public.les_wijzigen(text, text, bigint, text), public.cursus_lezen(text, text, bigint),
  public.les_klaar(text, text, bigint, boolean),
  public.plan_opslaan(text, text, bigint, bigint, text, integer, text, boolean) from public;
grant execute on function public.community_aanbod(text, text, bigint), public.mijn_cursussen(text, text),
  public.cursus_opslaan(text, text, bigint, bigint, text, text, integer, boolean, boolean),
  public.cursus_weg(text, text, bigint), public.les_opslaan(text, text, bigint, bigint, text, text, text, integer),
  public.les_wijzigen(text, text, bigint, text), public.cursus_lezen(text, text, bigint),
  public.les_klaar(text, text, bigint, boolean),
  public.plan_opslaan(text, text, bigint, bigint, text, integer, text, boolean) to anon, authenticated;
revoke execute on function public.stripe_cursus(bigint, bigint),
  public.stripe_cursus_gekocht(bigint, bigint, text, text, integer), public.stripe_community_plan(bigint, bigint),
  public.stripe_community_abonnement_opslaan(text, bigint, bigint, text, timestamptz, boolean),
  public.stripe_community_abonnementen(bigint) from public, anon, authenticated;
grant execute on function public.stripe_cursus(bigint, bigint),
  public.stripe_cursus_gekocht(bigint, bigint, text, text, integer), public.stripe_community_plan(bigint, bigint),
  public.stripe_community_abonnement_opslaan(text, bigint, bigint, text, timestamptz, boolean),
  public.stripe_community_abonnementen(bigint) to service_role;
