-- Zakelijk: groepslessen (gym, club, studio). Bouwt op sql/chat_boeken.sql (boekhouding en saldo per klant).
-- De eigenaar maakt een rooster; leden schrijven zich in via de chat. Vol = wachtlijst; wie afmeldt, maakt plek
-- voor de eerste op de wachtlijst. Afvinken zet de les op de rekening van het lid (als de les een prijs heeft).

create table if not exists private.lessen (
  id bigint generated always as identity primary key,
  gebruiker_id bigint not null references private.gebruikers(id),
  naam text not null,
  start timestamptz not null,
  minuten integer not null check (minuten between 10 and 480),
  plekken integer not null check (plekken between 1 and 500),
  prijs integer not null default 0 check (prijs between 0 and 1000000),
  locatie text not null default '',
  reeks text,
  weg boolean not null default false,
  aangemaakt timestamptz not null default now()
);
create index if not exists lessen_gebruiker_start on private.lessen (gebruiker_id, start);

create table if not exists private.les_deelnemers (
  id bigint generated always as identity primary key,
  les_id bigint not null references private.lessen(id),
  klant_id bigint references private.gebruikers(id),
  naam text not null,
  status text not null default 'ingeschreven' check (status in ('ingeschreven', 'wachtlijst', 'afgemeld')),
  afgevinkt text check (afgevinkt in ('gekomen', 'niet_gekomen')),
  aangemaakt timestamptz not null default now()
);
create unique index if not exists les_deelnemers_uniek on private.les_deelnemers (les_id, klant_id) where klant_id is not null;
create index if not exists les_deelnemers_klant on private.les_deelnemers (klant_id) where klant_id is not null;
alter table private.lessen enable row level security;
alter table private.les_deelnemers enable row level security;

create or replace function private.les_json(l private.lessen, p_ik bigint)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('id', l.id, 'naam', l.naam, 'start', l.start, 'minuten', l.minuten, 'plekken', l.plekken,
    'prijs', l.prijs, 'locatie', l.locatie, 'reeks', l.reeks, 'weg', l.weg,
    'ingeschreven', (select count(*) from private.les_deelnemers d where d.les_id = l.id and d.status = 'ingeschreven'),
    'wachtlijst', (select count(*) from private.les_deelnemers d where d.les_id = l.id and d.status = 'wachtlijst'),
    'mijn', (select d.status from private.les_deelnemers d where d.les_id = l.id and d.klant_id = p_ik))
$$;

-- Een les (of elke week dezelfde les, hoogstens 26 keer).
create or replace function public.zaak_les_maken(p_naam text, p_wachtwoord text, p_les jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); i jsonb := coalesce(p_les, '{}'::jsonb);
  v_start timestamp; v_aantal int; v_reeks text; v_naam text := left(trim(coalesce(i ->> 'naam', '')), 60);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if v_naam = '' then return jsonb_build_object('fout', 'Geef de les een naam.'); end if;
  if coalesce(i ->> 'start', '') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}' then return jsonb_build_object('fout', 'Kies wanneer.'); end if;
  v_start := left(i ->> 'start', 16)::timestamp;
  if v_start < now() at time zone 'Europe/Amsterdam' - interval '1 day' then
    return jsonb_build_object('fout', 'Kies een moment in de toekomst.');
  end if;
  v_aantal := case when i ->> 'herhaal' = 'week' then least(26, greatest(1, coalesce((i ->> 'aantal')::int, 12))) else 1 end;
  if (select count(*) from private.lessen where gebruiker_id = v_id and aangemaakt > now() - interval '1 day') + v_aantal > 300 then
    return jsonb_build_object('fout', 'Te veel lessen vandaag. Probeer het morgen opnieuw.');
  end if;
  v_reeks := case when v_aantal > 1 then encode(extensions.gen_random_bytes(8), 'hex') end;
  insert into private.lessen (gebruiker_id, naam, start, minuten, plekken, prijs, locatie, reeks)
  select v_id, v_naam, (v_start + make_interval(days => 7 * k)) at time zone 'Europe/Amsterdam',
         least(480, greatest(10, coalesce((i ->> 'minuten')::int, 60))),
         least(500, greatest(1, coalesce((i ->> 'plekken')::int, 12))),
         least(1000000, greatest(0, coalesce((i ->> 'prijs')::int, 0))),
         left(trim(coalesce(i ->> 'locatie', '')), 200), v_reeks
  from generate_series(0, v_aantal - 1) k;
  return jsonb_build_object('ok', true, 'aantal', v_aantal);
end; $$;

-- Een les laten vervallen (of deze en alle volgende van de reeks). Ingeschreven leden krijgen een melding.
create or replace function public.zaak_les_weg(p_naam text, p_wachtwoord text, p_id bigint, p_volgende boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); l private.lessen; x record; v_aantal int := 0;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into l from private.lessen where id = p_id and gebruiker_id = v_id and not weg;
  if l.id is null then return jsonb_build_object('fout', 'Dit kan niet (meer).'); end if;
  for x in update private.lessen set weg = true
           where gebruiker_id = v_id and not weg and start > now()
             and (id = l.id or (coalesce(p_volgende, false) and l.reeks is not null and reeks = l.reeks and start >= l.start))
           returning id, naam, start loop
    v_aantal := v_aantal + 1;
    perform private.push_inplannen(d.klant_id, now(), 'reservering', 'les-weg:' || x.id || ':' || d.klant_id,
      'Les gaat niet door: ' || x.naam, to_char(x.start at time zone 'Europe/Amsterdam', 'DD-MM HH24:MI'))
    from private.les_deelnemers d where d.les_id = x.id and d.klant_id is not null and d.status <> 'afgemeld';
  end loop;
  return jsonb_build_object('ok', true, 'aantal', v_aantal);
end; $$;

-- Het rooster voor de eigenaar, met de namen van de deelnemers.
create or replace function public.zaak_lessen(p_naam text, p_wachtwoord text, p_van date, p_tot date)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object('lessen', coalesce((select jsonb_agg(private.les_json(l, v_id) || jsonb_build_object('deelnemers',
      coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'naam', d.naam, 'klant_id', d.klant_id, 'status', d.status,
                                                    'afgevinkt', d.afgevinkt) order by d.status, d.aangemaakt)
                from private.les_deelnemers d where d.les_id = l.id and d.status <> 'afgemeld'), '[]'::jsonb)) order by l.start)
    from private.lessen l where l.gebruiker_id = v_id and not l.weg
      and (l.start at time zone 'Europe/Amsterdam')::date between p_van and p_tot), '[]'::jsonb));
end; $$;

-- De eigenaar zet iemand zonder account op de lijst (bijvoorbeeld wie binnenloopt).
create or replace function public.zaak_les_deelnemer(p_naam text, p_wachtwoord text, p_les bigint, p_wie text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); l private.lessen; v_wie text := left(trim(coalesce(p_wie, '')), 80);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into l from private.lessen where id = p_les and gebruiker_id = v_id and not weg;
  if l.id is null then return jsonb_build_object('fout', 'Deze les bestaat niet (meer).'); end if;
  if v_wie = '' then return jsonb_build_object('fout', 'Vul een naam in.'); end if;
  if (select count(*) from private.les_deelnemers where les_id = l.id) >= 600 then return jsonb_build_object('fout', 'De lijst is vol.'); end if;
  insert into private.les_deelnemers (les_id, naam, status) values (l.id, v_wie,
    case when (select count(*) from private.les_deelnemers where les_id = l.id and status = 'ingeschreven') < l.plekken
         then 'ingeschreven' else 'wachtlijst' end);
  return jsonb_build_object('ok', true);
end; $$;

-- Afvinken: gekomen zet de les op de rekening van het lid (als er een prijs is); '' draait het terug.
create or replace function public.zaak_les_afvinken(p_naam text, p_wachtwoord text, p_deelnemer bigint, p_afvink text,
                                                    p_btw integer)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); d private.les_deelnemers; l private.lessen;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if coalesce(p_afvink, '') not in ('', 'gekomen', 'niet_gekomen') then return jsonb_build_object('fout', 'Dit kan niet.'); end if;
  select d2.* into d from private.les_deelnemers d2 join private.lessen l2 on l2.id = d2.les_id
  where d2.id = p_deelnemer and l2.gebruiker_id = v_id and d2.status = 'ingeschreven';
  if d.id is null then return jsonb_build_object('fout', 'Dit kan niet (meer).'); end if;
  select * into l from private.lessen where id = d.les_id;
  update private.les_deelnemers set afgevinkt = nullif(p_afvink, '') where id = d.id;
  update private.zaak_posten set weg = true
  where gebruiker_id = v_id and les_id = l.id and soort = 'dienst' and not weg
    and private.klant_sleutel(klant_id, klant) = private.klant_sleutel(d.klant_id, d.naam);
  if l.prijs > 0 and p_afvink = 'gekomen' then
    insert into private.zaak_posten (gebruiker_id, klant_id, klant, soort, bedrag, btw, omschrijving, datum, les_id)
    values (v_id, d.klant_id, d.naam, 'dienst', l.prijs, case when p_btw in (0, 9, 21) then p_btw::smallint else 0 end, l.naam,
            (l.start at time zone 'Europe/Amsterdam')::date, l.id);
  end if;
  return jsonb_build_object('ok', true);
end; $$;

-- Voor leden in de chat: het rooster van de komende twee weken bij deze aanbieder.
create or replace function public.chat_rooster(p_naam text, p_wachtwoord text, p_adres text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_eigenaar bigint;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select bp.gebruiker_id into v_eigenaar from private.boekpaginas bp join private.gebruikers u on u.id = bp.gebruiker_id
  where bp.adres = lower(coalesce(p_adres, '')) and not u.verwijderd and not u.geblokkeerd;
  if v_eigenaar is null then return jsonb_build_object('fout', 'Dit rooster bestaat niet (meer).'); end if;
  return jsonb_build_object('naam', private.weergave(v_eigenaar), 'lessen', coalesce((
    select jsonb_agg(private.les_json(l, v_id) order by l.start) from private.lessen l
    where l.gebruiker_id = v_eigenaar and not l.weg and l.start > now() and l.start < now() + interval '14 days'), '[]'::jsonb));
end; $$;

-- Inschrijven of afmelden. Vol = wachtlijst. Wie afmeldt, maakt plek: de eerste op de wachtlijst schuift door.
create or replace function public.chat_les(p_naam text, p_wachtwoord text, p_les bigint, p_aan boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); l private.lessen; v_status text; v_door private.les_deelnemers;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into l from private.lessen where id = p_les and not weg and start > now();
  if l.id is null then return jsonb_build_object('fout', 'Deze les gaat niet (meer) door.'); end if;
  if l.gebruiker_id = v_id then return jsonb_build_object('fout', 'Dit is je eigen les.'); end if;
  perform pg_advisory_xact_lock(l.id);
  if coalesce(p_aan, false) then
    if (select count(*) from private.les_deelnemers d join private.lessen x on x.id = d.les_id
        where d.klant_id = v_id and d.status <> 'afgemeld' and x.start > now()) >= 30 then
      return jsonb_build_object('fout', 'Je staat al voor veel lessen ingeschreven.');
    end if;
    v_status := case when (select count(*) from private.les_deelnemers where les_id = l.id and status = 'ingeschreven') < l.plekken
                     then 'ingeschreven' else 'wachtlijst' end;
    insert into private.les_deelnemers (les_id, klant_id, naam, status) values (l.id, v_id, private.weergave(v_id), v_status)
    on conflict (les_id, klant_id) where klant_id is not null
    do update set status = case when private.les_deelnemers.status = 'afgemeld' then excluded.status
                                else private.les_deelnemers.status end
    returning status into v_status;
  else
    update private.les_deelnemers set status = 'afgemeld' where les_id = l.id and klant_id = v_id and status <> 'afgemeld'
    returning 'afgemeld' into v_status;
    if v_status is null then return jsonb_build_object('fout', 'Je stond niet ingeschreven.'); end if;
    if (select count(*) from private.les_deelnemers where les_id = l.id and status = 'ingeschreven') < l.plekken then
      update private.les_deelnemers set status = 'ingeschreven'
      where id = (select id from private.les_deelnemers where les_id = l.id and status = 'wachtlijst' order by aangemaakt limit 1)
      returning * into v_door;
      if v_door.klant_id is not null then
        perform private.push_inplannen(v_door.klant_id, now(), 'reservering', 'les-plek:' || l.id || ':' || v_door.klant_id,
          'Er is plek: ' || l.naam, to_char(l.start at time zone 'Europe/Amsterdam', 'DD-MM HH24:MI') || '. Je staat ingeschreven.');
      end if;
    end if;
  end if;
  return jsonb_build_object('ok', true, 'status', v_status, 'les', private.les_json(l, v_id));
end; $$;

-- chat_diensten ook voor een zaak met alleen groepslessen: soorten alleen als de boekingspagina aan staat.
create or replace function public.chat_diensten(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); p private.boekpaginas; v_lessen int;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into p from private.boekpaginas where gebruiker_id = v_id;
  select count(*) into v_lessen from private.lessen where gebruiker_id = v_id and not weg and start > now();
  if p.gebruiker_id is null or (not p.aan and v_lessen = 0) then
    return jsonb_build_object('fout', 'Zet eerst je diensten of lessen klaar bij Instellingen, Zakelijk.');
  end if;
  return jsonb_build_object('adres', p.adres, 'titel', p.titel, 'soorten', case when p.aan then p.soorten else '[]'::jsonb end,
                            'locatie', p.locatie, 'lessen', v_lessen > 0);
end; $$;

revoke all on function private.les_json(private.lessen, bigint) from public, anon, authenticated;
