-- Diensten boeken via de chat (trainer, kapper, bijles...). Bouwt op sql/boekpagina.sql.
-- Een aanbieder deelt zijn diensten in een gesprek; de klant kiest een vrij moment, eventueel elke (twee) week,
-- en betaalt met de eigen bank of de betaallink van de aanbieder. De app verplaatst zelf geen geld.

alter table private.boekpaginas add column if not exists betalen jsonb not null default '{}'::jsonb;
alter table private.boekingen add column if not exists klant_id bigint references private.gebruikers(id);
alter table private.boekingen add column if not exists reeks text;
alter table private.boekingen add column if not exists prijs integer not null default 0;
alter table private.boekingen add column if not exists betaald_gemeld timestamptz;
create index if not exists boekingen_klant on private.boekingen (klant_id, start) where klant_id is not null;

create or replace function private.boekpagina_json(p private.boekpaginas)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('adres', p.adres, 'aan', p.aan, 'titel', p.titel, 'intro', p.intro, 'soorten', p.soorten,
    'uren', p.uren, 'buffer', p.buffer, 'min_vooraf', p.min_vooraf, 'vooruit', p.vooruit, 'max_per_dag', p.max_per_dag,
    'bevestigen', p.bevestigen, 'locatie', p.locatie, 'betalen', p.betalen)
$$;

create or replace function private.boeking_json(b private.boekingen)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('id', b.id, 'soort', b.soort, 'start', b.start, 'minuten', b.minuten, 'naam', b.naam,
    'email', b.email, 'telefoon', b.telefoon, 'notitie', b.notitie, 'status', b.status, 'afspraak_id', b.afspraak_id,
    'verwerkt', b.verwerkt, 'prijs', b.prijs, 'reeks', b.reeks, 'via_chat', b.klant_id is not null,
    'betaald_gemeld', b.betaald_gemeld is not null)
$$;

-- Nu met een prijs per soort (in centen, 0 = gratis of niet vermeld) en je betaalgegevens.
create or replace function public.boekpagina_instellen(p_naam text, p_wachtwoord text, p_instellingen jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); i jsonb := coalesce(p_instellingen, '{}'::jsonb);
  v_adres text := lower(trim(coalesce(i ->> 'adres', ''))); v_soorten jsonb; p private.boekpaginas;
  v_iban text := upper(regexp_replace(coalesce(i -> 'betalen' ->> 'iban', ''), '\s', '', 'g'));
  v_link text := trim(coalesce(i -> 'betalen' ->> 'link', ''));
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if v_adres !~ '^[a-z0-9-]{3,40}$' then
    return jsonb_build_object('fout', 'Kies een linknaam van 3 tot 40 tekens: letters, cijfers en streepjes.');
  end if;
  if exists (select 1 from private.boekpaginas where adres = v_adres and gebruiker_id <> v_id) then
    return jsonb_build_object('fout', 'Deze linknaam is al in gebruik. Kies een andere.');
  end if;
  if v_iban <> '' and v_iban !~ '^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$' then
    return jsonb_build_object('fout', 'Dit IBAN klopt niet.');
  end if;
  if v_link <> '' and v_link !~ '^https://[^\s<>"]+$' then
    return jsonb_build_object('fout', 'De betaallink moet met https:// beginnen.');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('naam', left(trim(s ->> 'naam'), 60),
                                               'minuten', least(480, greatest(10, (s ->> 'minuten')::int)),
                                               'prijs', case when coalesce(s ->> 'prijs', '') ~ '^\d{1,7}$'
                                                             then least(1000000, (s ->> 'prijs')::int) else 0 end)), '[]'::jsonb)
  into v_soorten
  from (select s from jsonb_array_elements(case when jsonb_typeof(i -> 'soorten') = 'array' then i -> 'soorten'
                                                else '[]'::jsonb end) s limit 6) x
  where trim(coalesce(s ->> 'naam', '')) <> '' and coalesce(s ->> 'minuten', '') ~ '^\d{1,3}$';
  if jsonb_array_length(v_soorten) = 0 then return jsonb_build_object('fout', 'Voeg minstens één soort afspraak toe.'); end if;
  insert into private.boekpaginas as b (gebruiker_id, adres, aan, titel, intro, soorten, uren, buffer, min_vooraf,
                                        vooruit, max_per_dag, bevestigen, locatie, betalen)
  values (v_id, v_adres, coalesce((i ->> 'aan')::boolean, false), left(coalesce(i ->> 'titel', ''), 80),
          left(coalesce(i ->> 'intro', ''), 400), v_soorten,
          case when jsonb_typeof(i -> 'uren') = 'object' then i -> 'uren' else '{}'::jsonb end,
          least(120, greatest(0, coalesce((i ->> 'buffer')::int, 15))),
          least(336, greatest(0, coalesce((i ->> 'min_vooraf')::int, 12))),
          least(90, greatest(1, coalesce((i ->> 'vooruit')::int, 30))),
          least(20, greatest(1, coalesce((i ->> 'max_per_dag')::int, 4))),
          coalesce((i ->> 'bevestigen')::boolean, false), left(coalesce(i ->> 'locatie', ''), 200),
          jsonb_build_object('iban', v_iban, 'naam', left(trim(coalesce(i -> 'betalen' ->> 'naam', '')), 70),
                             'link', left(v_link, 300)))
  on conflict (gebruiker_id) do update set adres = excluded.adres, aan = excluded.aan, titel = excluded.titel,
    intro = excluded.intro, soorten = excluded.soorten, uren = excluded.uren, buffer = excluded.buffer,
    min_vooraf = excluded.min_vooraf, vooruit = excluded.vooruit, max_per_dag = excluded.max_per_dag,
    bevestigen = excluded.bevestigen, locatie = excluded.locatie, betalen = excluded.betalen
  returning * into p;
  return jsonb_build_object('ok', true, 'pagina', private.boekpagina_json(p));
end; $$;

-- Wat de klant mag zien van de betaalgegevens: alleen na het boeken, en alleen wat de aanbieder invulde.
create or replace function private.betaal_info(p private.boekpaginas)
returns jsonb language sql stable security definer set search_path to '' as $$
  select case when coalesce(p.betalen ->> 'iban', '') = '' and coalesce(p.betalen ->> 'link', '') = '' then null
    else jsonb_build_object('iban', coalesce(p.betalen ->> 'iban', ''),
                            'naam', coalesce(nullif(p.betalen ->> 'naam', ''), private.weergave(p.gebruiker_id)),
                            'link', coalesce(p.betalen ->> 'link', '')) end
$$;

-- De aanbieder: mijn diensten, om in een gesprek te delen.
create or replace function public.chat_diensten(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); p private.boekpaginas;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into p from private.boekpaginas where gebruiker_id = v_id;
  if p.gebruiker_id is null or not p.aan then
    return jsonb_build_object('fout', 'Zet eerst je diensten klaar bij Agenda, Plannen, Boekingspagina.');
  end if;
  return jsonb_build_object('adres', p.adres, 'titel', p.titel, 'soorten', p.soorten, 'locatie', p.locatie);
end; $$;

-- De klant: vrije dagen en tijden (zoals de boekingspagina, maar ingelogd).
create or replace function public.chat_dienst_bekijken(p_naam text, p_wachtwoord text, p_adres text, p_soort integer)
returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  if private.gebruiker_id(p_naam, p_wachtwoord) is null then return jsonb_build_object('geen_toegang', true); end if;
  return public.boekpagina_bekijken(p_adres, p_soort);
end; $$;

create or replace function public.chat_dienst_tijden(p_naam text, p_wachtwoord text, p_adres text, p_soort integer, p_datum date)
returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  if private.gebruiker_id(p_naam, p_wachtwoord) is null then return jsonb_build_object('geen_toegang', true); end if;
  return public.boekpagina_tijden(p_adres, p_soort, p_datum);
end; $$;

-- Boeken, eventueel elke week of elke twee weken (hoogstens 12 keer). Wat niet vrij is, wordt overgeslagen.
create or replace function public.chat_boeken(p_naam text, p_wachtwoord text, p_adres text, p_soort integer,
                                              p_start timestamptz, p_herhaal text, p_aantal integer, p_notitie text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); p private.boekpaginas; v_soort jsonb;
  v_minuten int; v_prijs int; v_stap interval; v_aantal int; v_reeks text; v_moment timestamptz; v_dag date;
  v_email text; v_ids bigint[] := '{}'; v_starts timestamptz[] := '{}'; v_over timestamptz[] := '{}'; b private.boekingen;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select bp.* into p from private.boekpaginas bp join private.gebruikers u on u.id = bp.gebruiker_id
  where bp.adres = lower(coalesce(p_adres, '')) and bp.aan and not u.verwijderd and not u.geblokkeerd;
  if p.gebruiker_id is null then return jsonb_build_object('fout', 'Deze diensten zijn niet (meer) te boeken.'); end if;
  if p.gebruiker_id = v_id then return jsonb_build_object('fout', 'Je kunt niet bij jezelf boeken.'); end if;
  v_soort := p.soorten -> coalesce(p_soort, 0);
  if v_soort is null then return jsonb_build_object('fout', 'Kies wat je wilt boeken.'); end if;
  v_minuten := (v_soort ->> 'minuten')::int;
  v_prijs := coalesce((v_soort ->> 'prijs')::int, 0);
  v_stap := case p_herhaal when 'week' then interval '7 days' when 'twee_weken' then interval '14 days' else null end;
  v_aantal := case when v_stap is null then 1 else least(12, greatest(1, coalesce(p_aantal, 1))) end;
  select coalesce(email, '') into v_email from private.gebruikers where id = v_id;
  perform pg_advisory_xact_lock(p.gebruiker_id);
  if (select count(*) from private.boekingen where gebruiker_id = p.gebruiker_id and aangemaakt > now() - interval '1 day') >= 40
     or (select count(*) from private.boekingen where gebruiker_id = p.gebruiker_id and klant_id = v_id
         and status in ('aangevraagd', 'bevestigd') and start > now()) + v_aantal > 26 then
    return jsonb_build_object('fout', 'Je kunt nu niet meer boeken. Probeer het later opnieuw.');
  end if;
  -- De eerste keer volgt alle regels van de boekingspagina; de volgende keren moeten ook vrij zijn.
  if not exists (select 1 from private.boek_momenten(p, (p_start at time zone 'Europe/Amsterdam')::date, v_minuten) m
                 where m = p_start) then
    return jsonb_build_object('fout', 'Dit moment is net niet meer vrij. Kies een ander moment.');
  end if;
  v_reeks := case when v_aantal > 1 then encode(extensions.gen_random_bytes(8), 'hex') end;
  for k in 0 .. v_aantal - 1 loop
    v_moment := ((p_start at time zone 'Europe/Amsterdam') + coalesce(v_stap, interval '0') * k) at time zone 'Europe/Amsterdam';
    v_dag := (v_moment at time zone 'Europe/Amsterdam')::date;
    if k > 0 and (private.boek_bezet(p.gebruiker_id, v_moment, v_moment + make_interval(mins => v_minuten), p.buffer)
       or (select count(*) from private.boekingen x where x.gebruiker_id = p.gebruiker_id
           and x.status in ('aangevraagd', 'bevestigd') and (x.start at time zone 'Europe/Amsterdam')::date = v_dag) >= p.max_per_dag)
    then
      v_over := v_over || v_moment;
      continue;
    end if;
    insert into private.boekingen (gebruiker_id, soort, start, minuten, naam, email, notitie, status, code_hash,
                                   klant_id, reeks, prijs)
    values (p.gebruiker_id, v_soort ->> 'naam', v_moment, v_minuten, private.weergave(v_id), v_email,
            left(trim(coalesce(p_notitie, '')), 500), case when p.bevestigen then 'aangevraagd' else 'bevestigd' end,
            encode(extensions.digest(encode(extensions.gen_random_bytes(12), 'hex'), 'sha256'), 'hex'),
            v_id, v_reeks, v_prijs)
    returning * into b;
    v_ids := v_ids || b.id;
    v_starts := v_starts || v_moment;
  end loop;
  perform private.push_inplannen(p.gebruiker_id, now(), 'reservering', 'boeking:' || v_ids[1],
    case when p.bevestigen then 'Nieuwe aanvraag: ' else 'Nieuwe boeking: ' end || (v_soort ->> 'naam'),
    private.weergave(v_id) || ', ' || to_char(p_start at time zone 'Europe/Amsterdam', 'DD-MM HH24:MI')
      || case when array_length(v_ids, 1) > 1 then ' (' || array_length(v_ids, 1) || 'x)' else '' end);
  return jsonb_build_object('ok', true, 'ids', to_jsonb(v_ids), 'starts', to_jsonb(v_starts), 'overgeslagen', to_jsonb(v_over),
    'status', case when p.bevestigen then 'aangevraagd' else 'bevestigd' end, 'soort', v_soort ->> 'naam',
    'minuten', v_minuten, 'prijs', v_prijs, 'naam', private.weergave(p.gebruiker_id), 'locatie', p.locatie,
    'betalen', private.betaal_info(p));
end; $$;

-- De klant annuleert (alle nog komende keren uit de lijst) of meldt dat hij betaald heeft.
create or replace function public.chat_boeking_klant(p_naam text, p_wachtwoord text, p_ids bigint[], p_actie text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_aantal int; v_eerste private.boekingen;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if p_actie = 'betaald' then
    update private.boekingen set betaald_gemeld = coalesce(betaald_gemeld, now())
    where id = any(coalesce(p_ids, '{}')) and klant_id = v_id and status in ('aangevraagd', 'bevestigd');
    get diagnostics v_aantal = row_count;
  elsif p_actie = 'annuleren' then
    select * into v_eerste from private.boekingen where id = any(coalesce(p_ids, '{}')) and klant_id = v_id
      and status in ('aangevraagd', 'bevestigd') and start > now() order by start limit 1;
    update private.boekingen set status = 'geannuleerd', verwerkt = afspraak_id is null
    where id = any(coalesce(p_ids, '{}')) and klant_id = v_id and status in ('aangevraagd', 'bevestigd') and start > now();
    get diagnostics v_aantal = row_count;
    if v_aantal > 0 then
      perform private.push_inplannen(v_eerste.gebruiker_id, now(), 'reservering', 'boeking-weg:' || v_eerste.id,
        'Geannuleerd: ' || v_eerste.soort, v_eerste.naam || ', '
          || to_char(v_eerste.start at time zone 'Europe/Amsterdam', 'DD-MM HH24:MI')
          || case when v_aantal > 1 then ' (' || v_aantal || 'x)' else '' end);
    end if;
  else
    return jsonb_build_object('fout', 'Dit kan niet.');
  end if;
  if v_aantal = 0 then return jsonb_build_object('fout', 'Dit kan niet (meer).'); end if;
  return jsonb_build_object('ok', true, 'aantal', v_aantal);
end; $$;

-- De aanbieder: bevestigen of afwijzen vanuit de chat (alle aangevraagde keren uit de lijst tegelijk).
create or replace function public.chat_boeking_afhandelen(p_naam text, p_wachtwoord text, p_ids bigint[], p_actie text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_aantal int;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if p_actie not in ('bevestigen', 'afwijzen', 'annuleren') then return jsonb_build_object('fout', 'Dit kan niet.'); end if;
  update private.boekingen set
    status = case p_actie when 'bevestigen' then 'bevestigd' when 'afwijzen' then 'afgewezen' else 'geannuleerd' end,
    verwerkt = false
  where id = any(coalesce(p_ids, '{}')) and gebruiker_id = v_id
    and case p_actie when 'annuleren' then status in ('aangevraagd', 'bevestigd') and start > now()
                     else status = 'aangevraagd' end;
  get diagnostics v_aantal = row_count;
  if v_aantal = 0 then return jsonb_build_object('fout', 'Dit kan niet (meer).'); end if;
  return jsonb_build_object('ok', true, 'aantal', v_aantal);
end; $$;

revoke all on function private.betaal_info(private.boekpaginas) from public, anon, authenticated;

-- --- Afvinken en saldo per klant (begin van de zakelijke boekhouding) -------------------------------------------------
-- Een post is een regel in je boekhouding: een geleverde dienst (de klant moet betalen), een ontvangen betaling of
-- eigen kosten. Saldo per klant = betalingen - diensten (positief = tegoed, negatief = nog te betalen).

alter table private.boekingen add column if not exists afgevinkt text check (afgevinkt in ('gekomen', 'niet_gekomen'));

create table if not exists private.zaak_posten (
  id bigint generated always as identity primary key,
  gebruiker_id bigint not null references private.gebruikers(id),
  klant_id bigint references private.gebruikers(id),
  klant text not null default '',
  soort text not null check (soort in ('dienst', 'betaling', 'kosten')),
  bedrag integer not null check (bedrag between 0 and 100000000),
  btw smallint not null default 0 check (btw in (0, 9, 21)),
  omschrijving text not null default '',
  categorie text not null default '',
  datum date not null default current_date,
  boeking_id bigint references private.boekingen(id),
  les_id bigint,
  weg boolean not null default false,
  aangemaakt timestamptz not null default now()
);
create index if not exists zaak_posten_gebruiker on private.zaak_posten (gebruiker_id, datum);
create index if not exists zaak_posten_klant on private.zaak_posten (klant_id) where klant_id is not null;
create index if not exists zaak_posten_boeking on private.zaak_posten (boeking_id) where boeking_id is not null;
alter table private.zaak_posten enable row level security;

create or replace function private.klant_sleutel(p_klant_id bigint, p_klant text)
returns text language sql immutable set search_path to '' as $$
  select case when p_klant_id is not null then 'id:' || p_klant_id else 'naam:' || lower(trim(coalesce(p_klant, ''))) end
$$;

-- Saldo van één klant bij één aanbieder, in centen.
create or replace function private.klant_saldo(p_gebruiker bigint, p_sleutel text)
returns integer language sql stable security definer set search_path to '' as $$
  select coalesce(sum(case soort when 'betaling' then bedrag when 'dienst' then -bedrag else 0 end), 0)::int
  from private.zaak_posten where gebruiker_id = p_gebruiker and not weg and soort <> 'kosten'
    and private.klant_sleutel(klant_id, klant) = p_sleutel
$$;

create or replace function private.post_json(z private.zaak_posten)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('id', z.id, 'klant', z.klant, 'klant_id', z.klant_id,
    'sleutel', private.klant_sleutel(z.klant_id, z.klant), 'soort', z.soort, 'bedrag', z.bedrag, 'btw', z.btw,
    'omschrijving', z.omschrijving, 'categorie', z.categorie, 'datum', z.datum, 'boeking_id', z.boeking_id,
    'les_id', z.les_id)
$$;

-- De aanbieder vinkt een afspraak af: gekomen (de prijs komt op de rekening van de klant), niet gekomen
-- (alleen rekenen als je dat kiest) of '' om het afvinken terug te draaien.
create or replace function public.zaak_afvinken(p_naam text, p_wachtwoord text, p_boeking bigint, p_afvink text,
                                                p_rekenen boolean, p_btw integer)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); b private.boekingen;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if coalesce(p_afvink, '') not in ('', 'gekomen', 'niet_gekomen') then return jsonb_build_object('fout', 'Dit kan niet.'); end if;
  update private.boekingen set afgevinkt = nullif(p_afvink, '')
  where id = p_boeking and gebruiker_id = v_id and status = 'bevestigd' and start < now() + interval '1 day'
  returning * into b;
  if b.id is null then return jsonb_build_object('fout', 'Dit kan (nog) niet.'); end if;
  update private.zaak_posten set weg = true where boeking_id = b.id and soort = 'dienst' and not weg;
  if b.prijs > 0 and (p_afvink = 'gekomen' or (p_afvink = 'niet_gekomen' and coalesce(p_rekenen, false))) then
    insert into private.zaak_posten (gebruiker_id, klant_id, klant, soort, bedrag, btw, omschrijving, datum, boeking_id)
    values (v_id, b.klant_id, b.naam, 'dienst', b.prijs, case when p_btw in (0, 9, 21) then p_btw::smallint else 0 end,
            b.soort || case when p_afvink = 'niet_gekomen' then ' (niet gekomen)' else '' end,
            (b.start at time zone 'Europe/Amsterdam')::date, b.id);
  end if;
  return jsonb_build_object('ok', true, 'saldo', private.klant_saldo(v_id, private.klant_sleutel(b.klant_id, b.naam)));
end; $$;

-- Een regel toevoegen: betaling ontvangen, eigen kosten, of een dienst zonder afspraak (bijvoorbeeld een les).
create or replace function public.zaak_post(p_naam text, p_wachtwoord text, p_post jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); i jsonb := coalesce(p_post, '{}'::jsonb);
  v_klant_id bigint; v_bedrag int; z private.zaak_posten;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if coalesce(i ->> 'soort', '') not in ('dienst', 'betaling', 'kosten') then return jsonb_build_object('fout', 'Kies wat voor regel.'); end if;
  if coalesce(i ->> 'bedrag', '') !~ '^\d{1,9}$' then return jsonb_build_object('fout', 'Vul een bedrag in.'); end if;
  v_bedrag := (i ->> 'bedrag')::int;
  if v_bedrag <= 0 or v_bedrag > 100000000 then return jsonb_build_object('fout', 'Vul een bedrag in.'); end if;
  -- Een klant met account alleen als die al eens bij je boekte of op je rekening staat (geen vreemden koppelen).
  if coalesce(i ->> 'klant_id', '') ~ '^\d+$' then
    v_klant_id := (i ->> 'klant_id')::bigint;
    if not exists (select 1 from private.boekingen where gebruiker_id = v_id and klant_id = v_klant_id)
       and not exists (select 1 from private.zaak_posten where gebruiker_id = v_id and klant_id = v_klant_id) then
      v_klant_id := null;
    end if;
  end if;
  if (select count(*) from private.zaak_posten where gebruiker_id = v_id and aangemaakt > now() - interval '1 day') >= 500 then
    return jsonb_build_object('fout', 'Te veel regels vandaag. Probeer het morgen opnieuw.');
  end if;
  insert into private.zaak_posten (gebruiker_id, klant_id, klant, soort, bedrag, btw, omschrijving, categorie, datum)
  values (v_id, v_klant_id,
          case when i ->> 'soort' = 'kosten' then '' else
            coalesce(case when v_klant_id is not null then private.weergave(v_klant_id) end, left(trim(coalesce(i ->> 'klant', '')), 80)) end,
          i ->> 'soort', v_bedrag,
          case when coalesce(i ->> 'btw', '') in ('0', '9', '21') then (i ->> 'btw')::smallint else 0 end,
          left(trim(coalesce(i ->> 'omschrijving', '')), 200), left(trim(coalesce(i ->> 'categorie', '')), 60),
          case when coalesce(i ->> 'datum', '') ~ '^\d{4}-\d{2}-\d{2}$' then (i ->> 'datum')::date else current_date end)
  returning * into z;
  return jsonb_build_object('ok', true, 'post', private.post_json(z));
end; $$;

create or replace function public.zaak_post_weg(p_naam text, p_wachtwoord text, p_id bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  update private.zaak_posten set weg = true where id = p_id and gebruiker_id = v_id and not weg;
  if not found then return jsonb_build_object('fout', 'Dit kan niet (meer).'); end if;
  return jsonb_build_object('ok', true);
end; $$;

-- De klant meldde 'betaald': de aanbieder bevestigt dat het geld binnen is. Dat wordt een betaling op de rekening.
create or replace function public.zaak_betaling_ontvangen(p_naam text, p_wachtwoord text, p_ids bigint[], p_bedrag integer)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); b private.boekingen; v_bedrag int;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into b from private.boekingen where id = any(coalesce(p_ids, '{}')) and gebruiker_id = v_id order by start limit 1;
  if b.id is null then return jsonb_build_object('fout', 'Dit kan niet.'); end if;
  v_bedrag := coalesce(p_bedrag, (select sum(prijs) from private.boekingen where id = any(p_ids) and gebruiker_id = v_id
                                  and status <> 'afgewezen'))::int;
  if v_bedrag is null or v_bedrag <= 0 or v_bedrag > 100000000 then return jsonb_build_object('fout', 'Vul een bedrag in.'); end if;
  update private.boekingen set betaald_gemeld = coalesce(betaald_gemeld, now()) where id = any(p_ids) and gebruiker_id = v_id;
  insert into private.zaak_posten (gebruiker_id, klant_id, klant, soort, bedrag, omschrijving, boeking_id)
  values (v_id, b.klant_id, b.naam, 'betaling', v_bedrag, b.soort, b.id);
  return jsonb_build_object('ok', true, 'saldo', private.klant_saldo(v_id, private.klant_sleutel(b.klant_id, b.naam)));
end; $$;

-- Alles voor het zakelijke overzicht: regels in een periode, saldi per klant en afspraken die nog afgevinkt moeten worden.
create or replace function public.zaak_overzicht(p_naam text, p_wachtwoord text, p_van date, p_tot date)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object(
    'posten', coalesce((select jsonb_agg(private.post_json(z) order by z.datum desc, z.id desc) from private.zaak_posten z
      where z.gebruiker_id = v_id and not z.weg and z.datum between p_van and p_tot), '[]'::jsonb),
    'saldi', coalesce((select jsonb_agg(jsonb_build_object('sleutel', s, 'klant', klant, 'klant_id', klant_id, 'saldo', saldo,
                                                           'laatst', laatst) order by saldo, klant)
      from (select private.klant_sleutel(klant_id, klant) s, max(klant) klant, max(klant_id) klant_id, max(datum) laatst,
                   sum(case soort when 'betaling' then bedrag else -bedrag end)::int saldo
            from private.zaak_posten where gebruiker_id = v_id and not weg and soort <> 'kosten'
            group by 1) x), '[]'::jsonb),
    'afvinken', coalesce((select jsonb_agg(private.boeking_json(b) || jsonb_build_object('afgevinkt', b.afgevinkt) order by b.start desc)
      from private.boekingen b where b.gebruiker_id = v_id and b.status = 'bevestigd'
        and b.start < now() and b.start > now() - interval '60 days'), '[]'::jsonb),
    'betaald_gemeld', coalesce((select jsonb_agg(private.boeking_json(b) order by b.start) from private.boekingen b
      where b.gebruiker_id = v_id and b.betaald_gemeld is not null and b.betaald_gemeld > now() - interval '60 days'
        and not exists (select 1 from private.zaak_posten z where z.gebruiker_id = v_id and not z.weg and z.soort = 'betaling'
                        and z.boeking_id in (select id from private.boekingen r where r.id = b.id
                                             or (b.reeks is not null and r.reeks = b.reeks)))), '[]'::jsonb));
end; $$;

-- Hoe staan deze boekingen ervoor? Voor de klant en voor de aanbieder (ieder ziet alleen de eigen boekingen),
-- met afgevinkt en het saldo van de klant bij de aanbieder.
create or replace function public.chat_boeking_status(p_naam text, p_wachtwoord text, p_ids bigint[])
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object('boekingen', coalesce((
    select jsonb_agg(jsonb_build_object('id', b.id, 'status', b.status, 'start', b.start, 'afgevinkt', b.afgevinkt,
      'betaald', b.betaald_gemeld is not null, 'aanbieder', b.gebruiker_id = v_id,
      'betalen', case when b.klant_id = v_id then private.betaal_info(p) end,
      'saldo', private.klant_saldo(b.gebruiker_id, private.klant_sleutel(b.klant_id, b.naam)),
      'ontvangen', exists (select 1 from private.zaak_posten z where not z.weg and z.soort = 'betaling'
        and z.boeking_id in (select r.id from private.boekingen r where r.id = b.id or (b.reeks is not null and r.reeks = b.reeks)))))
    from private.boekingen b left join private.boekpaginas p on p.gebruiker_id = b.gebruiker_id
    where b.id = any(coalesce(p_ids, '{}')) and (b.klant_id = v_id or b.gebruiker_id = v_id)), '[]'::jsonb));
end; $$;

revoke all on function private.klant_saldo(bigint, text) from public, anon, authenticated;
revoke all on function private.post_json(private.zaak_posten) from public, anon, authenticated;
