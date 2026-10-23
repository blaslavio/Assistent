-- Eigen pushmeldingen (Web Push), zonder extra app. De web-app op je beginscherm (docs/ op GitHub Pages) vraagt
-- toestemming en geeft een abonnement van de browser door; de Edge Function `push` versleutelt elke melding voor dat
-- ene toestel en stuurt hem via de pushdienst van Apple, Google of Mozilla. Die diensten zien alleen versleutelde data.
--
-- Koppelen gaat met een eenmalige code van 10 minuten die de ingelogde app maakt: de web-app krijgt nooit je
-- wachtwoord of sessie te zien. Meldingen komen uit dezelfde wachtrij als ntfy (sql/meldingen.sql).

alter table private.push add column if not exists ntfy boolean not null default true;

create table if not exists private.push_web (
  id bigint generated always as identity primary key,
  gebruiker_id bigint not null references private.gebruikers(id),
  endpoint text not null unique check (length(endpoint) <= 1000),
  p256dh text not null check (length(p256dh) <= 200),
  auth text not null check (length(auth) <= 100),
  apparaat text not null default '' check (length(apparaat) <= 80),
  aangemaakt timestamptz not null default now(),
  laatst_ok timestamptz,
  fouten integer not null default 0,
  weg boolean not null default false
);
create index if not exists push_web_gebruiker on private.push_web (gebruiker_id) where not weg;
alter table private.push_web enable row level security;

create table if not exists private.push_web_codes (
  code_hash text primary key,
  gebruiker_id bigint not null references private.gebruikers(id),
  geldig_tot timestamptz not null,
  gebruikt boolean not null default false
);
alter table private.push_web_codes enable row level security;

-- Het adres van de app, zodat de web-app weet wat hij moet openen. Alleen de eigenaar zet het (vanuit de app zelf).
create or replace function public.app_adres()
returns text language sql stable security definer set search_path to '' as $$
  select app_adres from private.platform where id = 1
$$;

create or replace function public.app_adres_onthouden(p_naam text, p_wachtwoord text, p_adres text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_adres text := rtrim(lower(trim(coalesce(p_adres, ''))), '/');
begin
  if v_id is distinct from 1 then return jsonb_build_object('geen_toegang', true); end if;
  if v_adres !~ '^https://[a-z0-9-]+\.streamlit\.app$' then return jsonb_build_object('fout', 'Geen app-adres.'); end if;
  update private.platform set app_adres = v_adres where id = 1 and app_adres is distinct from v_adres;
  return jsonb_build_object('ok', true);
end; $$;

-- Eenmalige koppelcode voor dit toestel (10 minuten geldig, alleen de hash wordt bewaard).
create or replace function public.push_web_code(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
  v_code text := encode(extensions.gen_random_bytes(18), 'hex');
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if (select count(*) from private.push_web_codes where gebruiker_id = v_id and geldig_tot > now()) >= 10 then
    return jsonb_build_object('fout', 'Probeer het over een paar minuten opnieuw.');
  end if;
  insert into private.push_web_codes (code_hash, gebruiker_id, geldig_tot)
  values (encode(extensions.digest(v_code, 'sha256'), 'hex'), v_id, now() + interval '10 minutes');
  return jsonb_build_object('ok', true, 'code', v_code);
end; $$;

-- Vanuit de web-app (zonder inloggen): code + abonnement van de browser. De code werkt maar één keer.
create or replace function public.push_web_koppelen(p_code text, p_abonnement jsonb, p_apparaat text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare c private.push_web_codes; v_endpoint text := p_abonnement ->> 'endpoint';
  v_p256dh text := p_abonnement #>> '{keys,p256dh}'; v_auth text := p_abonnement #>> '{keys,auth}';
begin
  select * into c from private.push_web_codes
  where code_hash = encode(extensions.digest(coalesce(p_code, ''), 'sha256'), 'hex') for update;
  if c.code_hash is null or c.gebruikt or c.geldig_tot < now() then
    return jsonb_build_object('fout', 'Deze koppeling is verlopen. Probeer het opnieuw vanuit de app.');
  end if;
  -- Alleen echte pushdiensten (Apple, Google, Mozilla, Microsoft); geen willekeurige adressen.
  if v_endpoint !~ '^https://([a-z0-9-]+\.)*(push\.apple\.com|fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com)/'
     or coalesce(v_p256dh, '') !~ '^[A-Za-z0-9_-]{80,100}={0,2}$' or coalesce(v_auth, '') !~ '^[A-Za-z0-9_-]{16,30}={0,2}$' then
    return jsonb_build_object('fout', 'Deze browser geeft geen geldig abonnement.');
  end if;
  update private.push_web_codes set gebruikt = true where code_hash = c.code_hash;
  insert into private.push_web (gebruiker_id, endpoint, p256dh, auth, apparaat)
  values (c.gebruiker_id, v_endpoint, v_p256dh, v_auth, left(coalesce(p_apparaat, ''), 80))
  on conflict (endpoint) do update set gebruiker_id = excluded.gebruiker_id, p256dh = excluded.p256dh,
    auth = excluded.auth, apparaat = excluded.apparaat, weg = false, fouten = 0, aangemaakt = now();
  insert into private.push (gebruiker_id, topic, ntfy)
  values (c.gebruiker_id, 'ma-' || encode(extensions.gen_random_bytes(12), 'hex'), false)
  on conflict (gebruiker_id) do update set aan = true, ntfy = false;
  return jsonb_build_object('ok', true);
end; $$;

create or replace function public.push_web_toestellen(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object('toestellen', coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 'apparaat', apparaat, 'aangemaakt', aangemaakt,
                                        'laatst_ok', laatst_ok) order by id)
    from private.push_web where gebruiker_id = v_id and not weg), '[]'::jsonb),
    'ntfy', coalesce((select ntfy from private.push where gebruiker_id = v_id), true));
end; $$;

create or replace function public.push_web_weg(p_naam text, p_wachtwoord text, p_id bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  update private.push_web set weg = true, endpoint = 'weg:' || id, p256dh = '', auth = ''
  where id = p_id and gebruiker_id = v_id;
  -- Geen toestel meer: dan gaan meldingen weer via ntfy (als je dat had).
  update private.push set ntfy = true
  where gebruiker_id = v_id and not exists (select 1 from private.push_web w where w.gebruiker_id = v_id and not w.weg);
  return jsonb_build_object('ok', true);
end; $$;

-- Voor de Edge Function (alleen service_role): wat nu verstuurd moet worden, met de toestellen erbij.
create or replace function public.push_web_ophalen()
returns jsonb language plpgsql security definer set search_path to '' as $$
declare m record; v_uit jsonb := '[]'::jsonb; v_nu time := (now() at time zone 'Europe/Amsterdam')::time; v_toestellen jsonb;
begin
  for m in
    select w.*, p.kort, p.soorten, p.stil_van, p.stil_tot
    from private.push_wachtrij w join private.push p on p.gebruiker_id = w.gebruiker_id
    join private.gebruikers g on g.id = w.gebruiker_id
    where w.verstuurd is null and not w.geannuleerd and w.wanneer <= now() and w.wanneer > now() - interval '1 hour'
      and p.aan and not p.ntfy and not g.verwijderd
    order by w.wanneer limit 100
    for update of w skip locked
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
    select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'endpoint', t.endpoint, 'p256dh', t.p256dh, 'auth', t.auth)),
                    '[]'::jsonb)
    into v_toestellen from private.push_web t where t.gebruiker_id = m.gebruiker_id and not t.weg;
    update private.push_wachtrij set verstuurd = now() where id = m.id;
    if jsonb_array_length(v_toestellen) > 0 then
      v_uit := v_uit || jsonb_build_object('id', m.id, 'soort', m.soort,
        'titel', case when m.kort then 'Mijn assistent' else m.titel end,
        'tekst', case when m.kort then 'Je hebt een melding.' else coalesce(nullif(m.tekst, ''), m.titel) end,
        'link', m.link, 'dringend', m.soort in ('vertrek', 'herinnering', 'test'), 'toestellen', v_toestellen);
    end if;
  end loop;
  return v_uit;
end; $$;

-- Na het versturen: werkt een toestel niet meer (de browser trok het abonnement in), dan valt het af.
create or replace function public.push_web_resultaat(p_ok bigint[], p_weg bigint[], p_fout bigint[])
returns void language sql security definer set search_path to '' as $$
  update private.push_web set laatst_ok = now(), fouten = 0 where id = any(coalesce(p_ok, '{}'));
  update private.push_web set weg = true, endpoint = 'weg:' || id, p256dh = '', auth = ''
  where id = any(coalesce(p_weg, '{}')) or (id = any(coalesce(p_fout, '{}')) and fouten >= 20);
  update private.push_web set fouten = fouten + 1 where id = any(coalesce(p_fout, '{}')) and not weg;
$$;

-- Elke minuut, maar de functie wordt alleen gewekt als er voor een web-toestel iets klaarstaat.
create or replace function private.push_web_wekken()
returns void language plpgsql security definer set search_path to '' as $$
begin
  if exists (select 1 from private.push_wachtrij w join private.push p on p.gebruiker_id = w.gebruiker_id
             where w.verstuurd is null and not w.geannuleerd and w.wanneer <= now()
               and w.wanneer > now() - interval '1 hour' and p.aan and not p.ntfy) then
    perform net.http_post(url := 'https://lnjsekmlpjyiwdlzcowa.supabase.co/functions/v1/push',
                          body := '{}'::jsonb, headers := '{"Content-Type": "application/json"}'::jsonb);
  end if;
end; $$;

-- ntfy alleen nog voor wie geen eigen web-toestel heeft.
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
    where w.verstuurd is null and not w.geannuleerd and w.wanneer <= now() and p.aan and p.ntfy and not g.verwijderd
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
  perform private.push_web_wekken();
  return v_aantal;
end; $$;


-- De VAPID-sleutels (afzenderbewijs) maakt de Edge Function zelf bij de eerste keer; de geheime helft verlaat de
-- server nooit. De publieke helft heeft de web-app nodig om zich te abonneren.
alter table private.platform add column if not exists vapid_publiek text not null default '';
alter table private.platform add column if not exists vapid_prive text not null default '';

create or replace function public.push_vapid_publiek()
returns text language sql stable security definer set search_path to '' as $$
  select vapid_publiek from private.platform where id = 1
$$;

create or replace function public.push_vapid()
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('publiek', vapid_publiek, 'prive', vapid_prive) from private.platform where id = 1
$$;

create or replace function public.push_vapid_opslaan(p_publiek text, p_prive text)
returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  update private.platform set vapid_publiek = p_publiek, vapid_prive = p_prive where id = 1 and vapid_prive = ''
    and p_publiek ~ '^[A-Za-z0-9_-]{86,88}$' and p_prive ~ '^[A-Za-z0-9_-]{42,44}$';
  return public.push_vapid();
end; $$;

revoke all on function private.push_web_wekken() from public, anon, authenticated;
revoke all on function public.push_web_ophalen(), public.push_web_resultaat(bigint[], bigint[], bigint[]),
  public.push_vapid(), public.push_vapid_opslaan(text, text) from public, anon, authenticated;
grant execute on function public.push_web_ophalen(), public.push_web_resultaat(bigint[], bigint[], bigint[]),
  public.push_vapid(), public.push_vapid_opslaan(text, text) to service_role;
grant execute on function public.push_vapid_publiek(), public.app_adres(), public.app_adres_onthouden(text, text, text),
  public.push_web_code(text, text), public.push_web_koppelen(text, jsonb, text),
  public.push_web_toestellen(text, text), public.push_web_weg(text, text, bigint) to anon, authenticated;
