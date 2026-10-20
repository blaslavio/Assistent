-- Meldingen op je telefoon, ook als de app dicht is. Via de gratis app ntfy: elke gebruiker krijgt een eigen,
-- geheim onderwerp (topic). De app zet herinneringen en vertrekwekkers klaar; triggers zetten meldingen klaar bij
-- uitnodigingen, reacties, berichten, reserveringen en antwoorden van restaurants. pg_cron verstuurt elke minuut
-- wat aan de beurt is via pg_net.

create extension if not exists pg_net;
create extension if not exists pg_cron;

create table if not exists private.push (
  gebruiker_id bigint primary key references private.gebruikers(id),
  topic text not null unique,
  aan boolean not null default true,
  kort boolean not null default false,              -- alleen "Je hebt een melding", zonder details
  soorten jsonb not null default '["vertrek", "herinnering", "uitnodiging", "reactie", "bericht", "reservering", "aanvraag"]'::jsonb,
  stil_van time,                                     -- stille uren: dan wachten niet-dringende meldingen
  stil_tot time,
  aangemaakt timestamptz not null default now()
);

create table if not exists private.push_wachtrij (
  id bigint generated always as identity primary key,
  gebruiker_id bigint not null references private.gebruikers(id),
  wanneer timestamptz not null,
  soort text not null,
  sleutel text not null,
  titel text not null,
  tekst text not null default '',
  link text not null default '',
  verstuurd timestamptz,
  geannuleerd boolean not null default false,
  aangemaakt timestamptz not null default now(),
  unique (gebruiker_id, sleutel)
);
create index if not exists push_wachtrij_open on private.push_wachtrij (wanneer) where verstuurd is null and not geannuleerd;

alter table private.push enable row level security;
alter table private.push_wachtrij enable row level security;

create or replace function private.push_inplannen(p_gebruiker bigint, p_wanneer timestamptz, p_soort text, p_sleutel text,
                                                  p_titel text, p_tekst text, p_link text default '')
returns void language sql security definer set search_path to '' as $$
  insert into private.push_wachtrij (gebruiker_id, wanneer, soort, sleutel, titel, tekst, link)
  select p_gebruiker, p_wanneer, p_soort, left(p_sleutel, 200), left(p_titel, 120), left(coalesce(p_tekst, ''), 400),
         left(coalesce(p_link, ''), 300)
  where exists (select 1 from private.push p where p.gebruiker_id = p_gebruiker and p.aan)
  on conflict (gebruiker_id, sleutel) do update set wanneer = excluded.wanneer, titel = excluded.titel,
    tekst = excluded.tekst, link = excluded.link, geannuleerd = false, soort = excluded.soort
  where private.push_wachtrij.verstuurd is null
$$;

create or replace function private.push_json(p private.push)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('topic', p.topic, 'aan', p.aan, 'kort', p.kort, 'soorten', p.soorten,
                            'stil_van', p.stil_van, 'stil_tot', p.stil_tot)
$$;

create or replace function public.push_status(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); p private.push;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into p from private.push where gebruiker_id = v_id;
  return jsonb_build_object('push', case when p.gebruiker_id is null then null else private.push_json(p) end,
    'verstuurd', (select count(*) from private.push_wachtrij where gebruiker_id = v_id and verstuurd > now() - interval '7 days'),
    'gepland', (select count(*) from private.push_wachtrij where gebruiker_id = v_id and verstuurd is null
                and not geannuleerd and wanneer > now()));
end; $$;

create or replace function public.push_instellen(p_naam text, p_wachtwoord text, p_aan boolean, p_kort boolean,
                                                 p_soorten jsonb, p_stil_van time, p_stil_tot time, p_nieuw_topic boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); p private.push;
  v_topic text := 'ma-' || encode(extensions.gen_random_bytes(12), 'hex');
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if p_soorten is not null and jsonb_typeof(p_soorten) <> 'array' then
    return jsonb_build_object('fout', 'Ongeldige keuze.');
  end if;
  insert into private.push (gebruiker_id, topic, aan, kort, soorten, stil_van, stil_tot)
  values (v_id, v_topic, coalesce(p_aan, true), coalesce(p_kort, false),
          coalesce(p_soorten, '["vertrek", "herinnering", "uitnodiging", "reactie", "bericht", "reservering", "aanvraag"]'::jsonb),
          p_stil_van, p_stil_tot)
  on conflict (gebruiker_id) do update set aan = coalesce(p_aan, private.push.aan), kort = coalesce(p_kort, private.push.kort),
    soorten = coalesce(p_soorten, private.push.soorten), stil_van = p_stil_van, stil_tot = p_stil_tot,
    topic = case when coalesce(p_nieuw_topic, false) then v_topic else private.push.topic end;
  if not coalesce(p_aan, true) then
    update private.push_wachtrij set geannuleerd = true where gebruiker_id = v_id and verstuurd is null;
  end if;
  select * into p from private.push where gebruiker_id = v_id;
  return jsonb_build_object('ok', true, 'push', private.push_json(p));
end; $$;

create or replace function public.push_testen(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if (select count(*) from private.push_wachtrij where gebruiker_id = v_id and soort = 'test'
      and aangemaakt > now() - interval '1 hour') >= 5 then
    return jsonb_build_object('fout', 'Je hebt net al een paar testmeldingen gestuurd.');
  end if;
  insert into private.push_wachtrij (gebruiker_id, wanneer, soort, sleutel, titel, tekst)
  values (v_id, now(), 'test', 'test:' || extract(epoch from clock_timestamp()), 'Het werkt!',
          'Vanaf nu krijg je hier je meldingen.');
  perform private.push_versturen();
  return jsonb_build_object('ok', true);
end; $$;

-- Herinneringen en vertrekwekkers vanuit de app: vervangt alle nog niet verstuurde van deze soorten.
create or replace function public.herinneringen_plannen(p_naam text, p_wachtwoord text, p_lijst jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); r jsonb; v_aantal int := 0;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if jsonb_typeof(coalesce(p_lijst, '[]'::jsonb)) <> 'array' then return jsonb_build_object('fout', 'Ongeldige lijst.'); end if;
  if not exists (select 1 from private.push where gebruiker_id = v_id and aan) then
    return jsonb_build_object('ok', true, 'gepland', 0);
  end if;
  update private.push_wachtrij set geannuleerd = true
  where gebruiker_id = v_id and verstuurd is null and soort in ('vertrek', 'herinnering')
    and sleutel not in (select x ->> 'sleutel' from jsonb_array_elements(coalesce(p_lijst, '[]'::jsonb)) x);
  for r in select * from jsonb_array_elements(coalesce(p_lijst, '[]'::jsonb)) limit 200 loop
    if r ->> 'soort' in ('vertrek', 'herinnering') and (r ->> 'wanneer')::timestamptz > now() - interval '5 minutes'
       and (r ->> 'wanneer')::timestamptz < now() + interval '30 days' then
      perform private.push_inplannen(v_id, (r ->> 'wanneer')::timestamptz, r ->> 'soort', r ->> 'sleutel',
                                     coalesce(r ->> 'titel', ''), r ->> 'tekst', r ->> 'link');
      v_aantal := v_aantal + 1;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'gepland', v_aantal);
end; $$;

-- Elke minuut: verstuurt wat aan de beurt is. Te oud (meer dan een uur) wordt overgeslagen.
create or replace function private.push_versturen()
returns integer language plpgsql security definer set search_path to '' as $$
declare m record; v_aantal int := 0; v_nu time := (now() at time zone 'Europe/Amsterdam')::time;
begin
  update private.push_wachtrij set geannuleerd = true
  where verstuurd is null and not geannuleerd and wanneer < now() - interval '1 hour';
  for m in
    select w.*, p.topic, p.kort, p.soorten, p.stil_van, p.stil_tot
    from private.push_wachtrij w join private.push p on p.gebruiker_id = w.gebruiker_id
    join private.gebruikers g on g.id = w.gebruiker_id
    where w.verstuurd is null and not w.geannuleerd and w.wanneer <= now() and p.aan and not g.verwijderd
    order by w.wanneer limit 100
  loop
    if m.soort <> 'test' and not (m.soorten ? m.soort) then
      update private.push_wachtrij set geannuleerd = true where id = m.id;
      continue;
    end if;
    if m.soort not in ('vertrek', 'herinnering', 'test') and m.stil_van is not null and m.stil_tot is not null
       and (case when m.stil_van <= m.stil_tot then v_nu >= m.stil_van and v_nu < m.stil_tot
                 else v_nu >= m.stil_van or v_nu < m.stil_tot end) then
      continue;
    end if;
    perform net.http_post(
      url := 'https://ntfy.sh/',
      body := jsonb_build_object('topic', m.topic,
        'title', case when m.kort then 'Mijn assistent' else m.titel end,
        'message', case when m.kort then 'Je hebt een melding.' else coalesce(nullif(m.tekst, ''), m.titel) end,
        'priority', case when m.soort = 'vertrek' then 4 else 3 end,
        'tags', jsonb_build_array(case m.soort when 'vertrek' then 'car' when 'herinnering' then 'calendar'
          when 'uitnodiging' then 'envelope' when 'reservering' then 'fork_and_knife' when 'aanvraag' then 'fork_and_knife'
          when 'bericht' then 'speech_balloon' when 'reactie' then 'speech_balloon' else 'bell' end))
        || case when m.link <> '' then jsonb_build_object('click', m.link) else '{}'::jsonb end,
      headers := '{"Content-Type": "application/json"}'::jsonb);
    update private.push_wachtrij set verstuurd = now() where id = m.id;
    v_aantal := v_aantal + 1;
  end loop;
  return v_aantal;
end; $$;

-- De titel van een afspraak uit iemands eigen gegevens.
create or replace function private.afspraak_titel(p_eigenaar bigint, p_afspraak text)
returns text language sql stable security definer set search_path to '' as $$
  select a ->> 'titel' from public.gegevens g, jsonb_array_elements(coalesce(g.data -> 'afspraken', '[]'::jsonb)) a
  where g.id = p_eigenaar and a ->> 'id' = p_afspraak limit 1
$$;

-- Triggers: meldingen bij gebeurtenissen van anderen.
create or replace function private.push_bij_uitnodiging()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if tg_op = 'INSERT' and not new.weg then
    perform private.push_inplannen(new.gast, now(), 'uitnodiging', 'uitnodiging:' || new.id,
      'Uitnodiging van ' || private.weergave(new.eigenaar), coalesce(private.afspraak_titel(new.eigenaar, new.afspraak), ''));
  elsif tg_op = 'UPDATE' and new.antwoord <> '' and new.antwoord is distinct from old.antwoord then
    perform private.push_inplannen(new.eigenaar, now(), 'uitnodiging', 'antwoord:' || new.id || ':' || new.antwoord,
      private.weergave(new.gast) || case new.antwoord when 'ja' then ' komt' when 'nee' then ' komt niet'
                                     else ' komt misschien' end,
      coalesce(private.afspraak_titel(new.eigenaar, new.afspraak), ''));
  end if;
  return new;
end; $$;
create or replace trigger push_uitnodiging after insert or update on private.agenda_uitnodigingen
  for each row execute function private.push_bij_uitnodiging();

create or replace function private.push_bij_reactie()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.door <> new.eigenaar then
    perform private.push_inplannen(new.eigenaar, now(), 'reactie', 'reactie:' || new.id,
      private.weergave(new.door) || case new.soort when 'op_tijd' then ' is op tijd'
        when 'later' then ' is ' || coalesce(new.minuten, 0) || ' min later' when 'kan_niet' then ' kan niet'
        else ' reageerde' end,
      concat_ws(': ', private.afspraak_titel(new.eigenaar, new.afspraak), nullif(new.tekst, '')));
  end if;
  return new;
end; $$;
create or replace trigger push_reactie after insert on private.agenda_reacties
  for each row execute function private.push_bij_reactie();

create or replace function private.push_bij_bericht()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  perform private.push_inplannen(new.aan, now(), 'bericht', 'bericht:' || new.id,
    'Bericht van ' || private.weergave(new.van), left(new.tekst, 140));
  return new;
end; $$;
create or replace trigger push_bericht after insert on private.berichten
  for each row execute function private.push_bij_bericht();

create or replace function private.push_bij_reservering()
returns trigger language plpgsql security definer set search_path to '' as $$
declare v_wanneer text := to_char(new.start at time zone 'Europe/Amsterdam', 'DD-MM HH24:MI');
  v_zaak text := (select naam from private.winkels where gebruiker_id = new.zaak);
begin
  if tg_op = 'INSERT' and new.status = 'bevestigd' then
    perform private.push_inplannen(new.zaak, now(), 'reservering', 'res:' || new.id,
      'Nieuwe reservering', v_wanneer || ', ' || new.personen || ' pers., ' || private.weergave(new.gast));
  elsif tg_op = 'UPDATE' and new.status = 'geannuleerd' and old.status <> 'geannuleerd' then
    if new.door_zaak then
      perform private.push_inplannen(new.gast, now(), 'reservering', 'res-weg:' || new.id,
        v_zaak || ' heeft je reservering geannuleerd', v_wanneer);
    elsif old.status = 'bevestigd' then
      perform private.push_inplannen(new.zaak, now(), 'reservering', 'res-weg:' || new.id,
        'Reservering geannuleerd', v_wanneer || ', ' || private.weergave(new.gast));
      perform private.push_inplannen(w.gast, now(), 'reservering', 'res-plek:' || w.id,
        'Er is plek bij ' || v_zaak, to_char(w.start at time zone 'Europe/Amsterdam', 'DD-MM HH24:MI') || '. Bevestig in de app.')
      from private.reserveringen w join private.reserveren z on z.gebruiker_id = w.zaak
      where w.zaak = new.zaak and w.status = 'wachtlijst' and w.start > now()
        and w.start < new.start + make_interval(mins => new.minuten) and new.start < w.start + make_interval(mins => w.minuten)
        and private.reserveren_bezet(w.zaak, w.start, w.minuten) + w.personen <= z.capaciteit;
    end if;
  end if;
  return new;
end; $$;
create or replace trigger push_reservering after insert or update on private.reserveringen
  for each row execute function private.push_bij_reservering();

create or replace function private.push_bij_aanvraag()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.door_plek and new.beantwoord is distinct from old.beantwoord then
    perform private.push_inplannen(new.gast, now(), 'aanvraag', 'aanvraag:' || new.id || ':' || new.status,
      new.plek || case new.status when 'bevestigd' then ' heeft bevestigd' when 'afgewezen' then ' kan helaas niet'
                                  else ' stelt een ander tijdstip voor' end,
      coalesce(nullif(new.antwoord, ''), to_char(coalesce(new.voorstel, new.start) at time zone 'Europe/Amsterdam', 'DD-MM HH24:MI')));
  end if;
  return new;
end; $$;
create or replace trigger push_aanvraag after update on private.aanvragen
  for each row execute function private.push_bij_aanvraag();

revoke all on function private.push_inplannen(bigint, timestamptz, text, text, text, text, text) from public, anon, authenticated;
revoke all on function private.push_versturen() from public, anon, authenticated;
revoke all on function private.push_json(private.push) from public, anon, authenticated;
revoke all on function private.afspraak_titel(bigint, text) from public, anon, authenticated;

select cron.schedule('push-versturen', '* * * * *', 'select private.push_versturen()');
