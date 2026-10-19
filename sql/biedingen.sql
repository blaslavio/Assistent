-- Bod doen op aanbod (marktplaats), zoals je dat kent van tweedehandsapps.
--
-- De koper doet een bod (minstens de helft van de vraagprijs). De verkoper accepteert, wijst af of doet een
-- tegenbod; op een tegenbod kan de koper weer ja of nee zeggen. Een geaccepteerd bod geldt 48 uur: wie dan
-- bestelt, betaalt de afgesproken prijs. Alleen een tabel en functies erbij; er wordt niets verwijderd.

create table if not exists private.biedingen (
  id bigint generated always as identity primary key,
  aanbod_id bigint not null references private.aanbod(id),
  koper bigint not null references private.gebruikers(id),
  verkoper bigint not null references private.gebruikers(id),
  bedrag numeric(10, 2) not null check (bedrag > 0),
  tegenbod numeric(10, 2),
  -- open: wacht op verkoper; tegenbod: wacht op koper; geaccepteerd: koper kan 48 uur voor deze prijs bestellen.
  status text not null default 'open'
    check (status in ('open', 'tegenbod', 'geaccepteerd', 'afgewezen', 'ingetrokken', 'gebruikt')),
  aangemaakt timestamptz not null default now(),
  bijgewerkt timestamptz not null default now()
);
create index if not exists biedingen_koper on private.biedingen (koper);
create index if not exists biedingen_verkoper on private.biedingen (verkoper);
alter table private.biedingen enable row level security;

-- Prijs waarvoor deze koper dit aanbod nu mag kopen (geaccepteerd bod, niet ouder dan 48 uur), anders null.
create or replace function private.bod_prijs(p_aanbod bigint, p_koper bigint)
returns numeric language sql stable security definer set search_path to '' as $$
  select coalesce(b.tegenbod, b.bedrag) from private.biedingen b
  where b.aanbod_id = p_aanbod and b.koper = p_koper and b.status = 'geaccepteerd'
    and b.bijgewerkt > now() - interval '48 hours'
  order by b.bijgewerkt desc limit 1
$$;

create or replace function private.euro(p_bedrag numeric)
returns text language sql immutable set search_path to '' as $$
  select '€ ' || replace(to_char(p_bedrag, 'FM999999990.00'), '.', ',')
$$;

create or replace function private.bod_json(b private.biedingen, p_ik bigint)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object(
    'id', b.id, 'aanbod_id', b.aanbod_id, 'titel', a.titel, 'vraagprijs', a.prijs, 'bedrag', b.bedrag,
    'tegenbod', b.tegenbod, 'status', b.status, 'aangemaakt', b.aangemaakt, 'bijgewerkt', b.bijgewerkt,
    'verlopen', b.status = 'geaccepteerd' and b.bijgewerkt <= now() - interval '48 hours',
    'geldig_tot', case when b.status = 'geaccepteerd' then b.bijgewerkt + interval '48 hours' end,
    'koper', private.weergave(b.koper), 'verkoper', private.weergave(b.verkoper),
    'ik_ben', case when b.koper = p_ik then 'koper' else 'verkoper' end,
    'aan_de_beurt', (b.status = 'open' and b.verkoper = p_ik) or (b.status = 'tegenbod' and b.koper = p_ik))
  from private.aanbod a where a.id = b.aanbod_id
$$;

create or replace function public.bod_doen(p_naam text, p_wachtwoord text, p_aanbod bigint, p_bedrag numeric,
                                           p_bericht text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_a private.aanbod; v_bod bigint;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into v_a from private.aanbod where id = p_aanbod and actief and not geblokkeerd;
  if v_a.id is null then return jsonb_build_object('fout', 'Dit aanbod is niet meer beschikbaar.'); end if;
  if v_a.gebruiker_id = v_id then return jsonb_build_object('fout', 'Dit is je eigen aanbod.'); end if;
  if v_a.soort <> 'product' or coalesce(v_a.prijs, 0) <= 0 then
    return jsonb_build_object('fout', 'Op dit aanbod kun je geen bod doen.');
  end if;
  if v_a.in_winkel and exists (select 1 from private.winkels where gebruiker_id = v_a.gebruiker_id and open) then
    return jsonb_build_object('fout', 'In een webshop gelden vaste prijzen.');
  end if;
  p_bedrag := round(coalesce(p_bedrag, 0), 2);
  if p_bedrag >= v_a.prijs then
    return jsonb_build_object('fout', 'Je bod is niet lager dan de vraagprijs. Bestel dan gewoon.');
  end if;
  if p_bedrag < round(v_a.prijs / 2, 2) then
    return jsonb_build_object('fout', 'Bied minstens de helft van de vraagprijs (' || private.euro(round(v_a.prijs / 2, 2)) || ').');
  end if;
  if exists (select 1 from private.biedingen where aanbod_id = p_aanbod and koper = v_id
             and status in ('open', 'tegenbod')) then
    return jsonb_build_object('fout', 'Je hebt hier al een bod lopen. Wacht op de verkoper of trek het in.');
  end if;
  if (select count(*) from private.biedingen where koper = v_id and aangemaakt > now() - interval '1 day') >= 20 then
    return jsonb_build_object('fout', 'Je hebt vandaag al veel biedingen gedaan. Probeer het morgen weer.');
  end if;
  insert into private.biedingen (aanbod_id, koper, verkoper, bedrag)
  values (p_aanbod, v_id, v_a.gebruiker_id, p_bedrag) returning id into v_bod;
  perform private.bericht(p_aanbod, v_id, v_a.gebruiker_id,
    'Ik bied ' || private.euro(p_bedrag) || ' (vraagprijs ' || private.euro(v_a.prijs) || ').' ||
    case when coalesce(trim(p_bericht), '') <> '' then ' ' || left(trim(p_bericht), 1000) else '' end);
  return jsonb_build_object('ok', true, 'id', v_bod);
end; $$;

-- Verkoper: accepteren, afwijzen of tegenbod (met p_bedrag). Koper: accepteren of afwijzen van een tegenbod, intrekken.
create or replace function public.bod_antwoorden(p_naam text, p_wachtwoord text, p_id bigint, p_actie text,
                                                 p_bedrag numeric)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); b private.biedingen; v_prijs numeric;
        v_tekst text; v_aan bigint;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into b from private.biedingen where id = p_id and v_id in (koper, verkoper) for update;
  if b.id is null then return jsonb_build_object('fout', 'Dit bod bestaat niet.'); end if;
  select prijs into v_prijs from private.aanbod where id = b.aanbod_id;

  if b.verkoper = v_id and b.status = 'open' and p_actie in ('accepteren', 'afwijzen', 'tegenbod') then
    if p_actie = 'tegenbod' then
      p_bedrag := round(coalesce(p_bedrag, 0), 2);
      if p_bedrag <= b.bedrag or p_bedrag >= v_prijs then
        return jsonb_build_object('fout', 'Een tegenbod ligt tussen het bod (' || private.euro(b.bedrag) ||
                                          ') en je vraagprijs (' || private.euro(v_prijs) || ').');
      end if;
      update private.biedingen set status = 'tegenbod', tegenbod = p_bedrag, bijgewerkt = now() where id = b.id;
      v_tekst := 'Tegenbod: ' || private.euro(p_bedrag) || '. Akkoord?';
    elsif p_actie = 'accepteren' then
      update private.biedingen set status = 'geaccepteerd', bijgewerkt = now() where id = b.id;
      v_tekst := 'Je bod van ' || private.euro(b.bedrag) || ' is geaccepteerd. Bestel binnen 48 uur voor die prijs.';
    else
      update private.biedingen set status = 'afgewezen', bijgewerkt = now() where id = b.id;
      v_tekst := 'Je bod van ' || private.euro(b.bedrag) || ' is helaas afgewezen.';
    end if;
    v_aan := b.koper;
  elsif b.koper = v_id and b.status = 'tegenbod' and p_actie in ('accepteren', 'afwijzen') then
    update private.biedingen set status = case when p_actie = 'accepteren' then 'geaccepteerd' else 'afgewezen' end,
                                 bijgewerkt = now() where id = b.id;
    v_tekst := case when p_actie = 'accepteren'
                    then 'Akkoord met je tegenbod van ' || private.euro(b.tegenbod) || '. Ik bestel binnen 48 uur.'
                    else 'Ik ga niet akkoord met het tegenbod van ' || private.euro(b.tegenbod) || '.' end;
    v_aan := b.verkoper;
  elsif b.koper = v_id and b.status in ('open', 'tegenbod') and p_actie = 'intrekken' then
    update private.biedingen set status = 'ingetrokken', bijgewerkt = now() where id = b.id;
    v_tekst := 'Ik trek mijn bod van ' || private.euro(b.bedrag) || ' in.';
    v_aan := b.verkoper;
  else
    return jsonb_build_object('fout', 'Dit kan nu niet meer bij dit bod.');
  end if;
  perform private.bericht(b.aanbod_id, v_id, v_aan, v_tekst);
  return jsonb_build_object('ok', true);
end; $$;

create or replace function public.mijn_biedingen(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object('biedingen', coalesce((
    select jsonb_agg(private.bod_json(b, v_id) order by b.bijgewerkt desc) from private.biedingen b
    where v_id in (b.koper, b.verkoper)
      and (b.status in ('open', 'tegenbod', 'geaccepteerd') or b.bijgewerkt > now() - interval '14 days')
  ), '[]'::jsonb));
end; $$;

-- Bestellen: zelfde als in webshop.sql, maar met de afgesproken prijs als er een geaccepteerd bod is.
create or replace function public.bestellen(p_naam text, p_wachtwoord text, p_aanbod bigint, p_betaalwijze text,
                                            p_levering text, p_bericht text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_a private.aanbod; v_best bigint;
        v_bod numeric;
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
  v_bod := private.bod_prijs(p_aanbod, v_id);
  insert into private.bestellingen (aanbod_id, koper, verkoper, titel, bedrag, betaalwijze, levering)
  values (p_aanbod, v_id, v_a.gebruiker_id, v_a.titel, coalesce(v_bod, v_a.prijs), p_betaalwijze, p_levering)
  returning id into v_best;
  if v_bod is not null then
    update private.biedingen set status = 'gebruikt', bijgewerkt = now()
    where aanbod_id = p_aanbod and koper = v_id and status = 'geaccepteerd';
  end if;
  perform private.bericht(p_aanbod, v_id, v_a.gebruiker_id,
    'Ik wil dit graag kopen' || case when v_bod is not null then ' voor de afgesproken ' || private.euro(v_bod) else '' end ||
    ' (betalen: ' || p_betaalwijze || ', ' || replace(p_levering, '_', ' ') || ')' ||
    case when coalesce(trim(p_bericht), '') <> '' then '. ' || left(trim(p_bericht), 1000) else '' end);
  return jsonb_build_object('ok', true, 'id', v_best, 'bedrag', coalesce(v_bod, v_a.prijs));
end; $$;

-- --- Rechten --------------------------------------------------------------------------------

revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function
  public.bod_doen(text, text, bigint, numeric, text), public.bod_antwoorden(text, text, bigint, text, numeric),
  public.mijn_biedingen(text, text), public.bestellen(text, text, bigint, text, text, text)
  from public;
grant execute on function
  public.bod_doen(text, text, bigint, numeric, text), public.bod_antwoorden(text, text, bigint, text, numeric),
  public.mijn_biedingen(text, text), public.bestellen(text, text, bigint, text, text, text)
  to anon, authenticated;
