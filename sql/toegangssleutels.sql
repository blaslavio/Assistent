-- Inloggen met Face ID of Touch ID (toegangssleutels, WebAuthn) en een herstelcode per mail.
--
-- Toegangssleutel: je toestel maakt een sleutelpaar; de geheime helft verlaat je toestel (of iCloud-sleutelhanger)
-- nooit. Wij bewaren alleen de publieke helft. De Edge Function `sleutel` controleert elke handtekening; de database
-- geeft pas een sessie als die functie (met de service-role) zegt dat het klopt. Werkt niet op een nagemaakte site,
-- want de sleutel hoort bij het adres van de app.
--
-- Herstel per mail: een code van 6 cijfers, 15 minuten geldig, 5 pogingen. Het antwoord is altijd hetzelfde, zodat
-- niemand kan uitzoeken welke mailadressen een account hebben. Met tweestapsverificatie is daarnaast de code uit je
-- app (of een herstelcode) nodig: alleen je mail is dan niet genoeg.

alter table private.gebruikers add column if not exists sleutel_handle text;
alter table private.platform add column if not exists sleutel_geheim text not null default '';
alter table private.platform add column if not exists mail_sleutel text not null default '';
alter table private.platform add column if not exists mail_afzender text not null default '';

create table if not exists private.toegangssleutels (
  id bigint generated always as identity primary key,
  gebruiker_id bigint not null references private.gebruikers(id),
  cred_id text not null unique check (length(cred_id) <= 1400),
  alg integer not null check (alg in (-7, -257)),
  sleutel jsonb not null,
  teller bigint not null default 0,
  naam text not null default '' check (length(naam) <= 80),
  aangemaakt timestamptz not null default now(),
  laatst timestamptz,
  weg boolean not null default false
);
create index if not exists toegangssleutels_gebruiker on private.toegangssleutels (gebruiker_id) where not weg;
alter table private.toegangssleutels enable row level security;

-- Elke uitdaging werkt één keer (alleen de hash).
create table if not exists private.sleutel_gebruikt (
  uitdaging_hash text primary key,
  tijd timestamptz not null default now()
);
alter table private.sleutel_gebruikt enable row level security;

create table if not exists private.herstel (
  id bigint generated always as identity primary key,
  gebruiker_id bigint not null references private.gebruikers(id),
  code_hash text not null,
  aangemaakt timestamptz not null default now(),
  geldig_tot timestamptz not null,
  pogingen integer not null default 0,
  gebruikt boolean not null default false
);
create index if not exists herstel_gebruiker on private.herstel (gebruiker_id, aangemaakt);
alter table private.herstel enable row level security;

-- --- Voor de Edge Function (alleen service_role) -------------------------------------------------------------

-- Het geheim waarmee de functie haar uitdagingen ondertekent; wordt de eerste keer gemaakt.
create or replace function public.sleutel_instellingen()
returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  update private.platform set sleutel_geheim = encode(extensions.gen_random_bytes(32), 'hex')
  where id = 1 and sleutel_geheim = '';
  return (select jsonb_build_object('geheim', sleutel_geheim, 'app_adres', coalesce(app_adres, ''))
          from private.platform where id = 1);
end; $$;

create or replace function public.sleutel_gebruiker(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); g private.gebruikers;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  update private.gebruikers set sleutel_handle = encode(extensions.gen_random_bytes(16), 'hex')
  where id = v_id and sleutel_handle is null;
  select * into g from private.gebruikers where id = v_id;
  return jsonb_build_object('id', g.id, 'handle', g.sleutel_handle,
    'naam', coalesce(nullif(g.email, ''), nullif(g.naam, ''), 'eigenaar'),
    'weergavenaam', coalesce(nullif(g.weergavenaam, ''), nullif(g.naam, ''), 'Eigenaar'),
    'bestaand', coalesce((select jsonb_agg(cred_id) from private.toegangssleutels
                          where gebruiker_id = v_id and not weg), '[]'::jsonb));
end; $$;

create or replace function public.sleutel_opslaan(p_gebruiker bigint, p_cred_id text, p_alg integer, p_sleutel jsonb,
                                                  p_teller bigint, p_naam text, p_uitdaging text)
returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  insert into private.sleutel_gebruikt (uitdaging_hash) values (private.hash(p_uitdaging)) on conflict do nothing;
  if not found then return jsonb_build_object('fout', 'Probeer het opnieuw.'); end if;
  if (select count(*) from private.toegangssleutels where gebruiker_id = p_gebruiker and not weg) >= 10 then
    return jsonb_build_object('fout', 'Je hebt al 10 toegangssleutels. Haal er eerst een weg.');
  end if;
  insert into private.toegangssleutels (gebruiker_id, cred_id, alg, sleutel, teller, naam)
  values (p_gebruiker, p_cred_id, p_alg, p_sleutel, greatest(coalesce(p_teller, 0), 0), left(coalesce(p_naam, ''), 80))
  on conflict (cred_id) do nothing;
  if not found then return jsonb_build_object('fout', 'Deze toegangssleutel is al gekoppeld.'); end if;
  return jsonb_build_object('ok', true);
end; $$;

create or replace function public.sleutel_zoeken(p_cred_id text)
returns jsonb language sql stable security definer set search_path to '' as $$
  select coalesce((select jsonb_build_object('id', t.id, 'alg', t.alg, 'sleutel', t.sleutel, 'teller', t.teller,
                                             'handle', g.sleutel_handle)
                   from private.toegangssleutels t join private.gebruikers g on g.id = t.gebruiker_id
                   where t.cred_id = p_cred_id and not t.weg and not g.geblokkeerd and not g.verwijderd),
                  '{}'::jsonb)
$$;

create or replace function public.sleutel_inloggen(p_id bigint, p_teller bigint, p_uitdaging text, p_apparaat text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare t private.toegangssleutels; g private.gebruikers;
begin
  insert into private.sleutel_gebruikt (uitdaging_hash) values (private.hash(p_uitdaging)) on conflict do nothing;
  if not found then return jsonb_build_object('fout', 'Probeer het opnieuw.'); end if;
  select * into t from private.toegangssleutels where id = p_id and not weg for update;
  select * into g from private.gebruikers where id = t.gebruiker_id and not geblokkeerd and not verwijderd;
  if g.id is null then return jsonb_build_object('fout', 'Deze toegangssleutel werkt niet meer.'); end if;
  -- Een teller die niet oploopt wijst op een gekopieerde sleutel (iCloud-sleutels tellen niet: die blijven 0).
  if coalesce(p_teller, 0) > 0 or t.teller > 0 then
    if coalesce(p_teller, 0) <= t.teller then
      insert into private.inlogs (gebruiker, apparaat, gelukt, reden) values (g.id, left(p_apparaat, 80), false, 'sleutel');
      return jsonb_build_object('fout', 'Deze toegangssleutel lijkt gekopieerd. Log in met je wachtwoord.');
    end if;
  end if;
  update private.toegangssleutels set teller = greatest(coalesce(p_teller, 0), 0), laatst = now() where id = t.id;
  insert into private.inlogs (gebruiker, apparaat, gelukt, reden) values (g.id, left(p_apparaat, 80), true, 'sleutel');
  return jsonb_build_object('token', private.nieuwe_sessie(g.id, p_apparaat), 'naam', coalesce(g.naam, ''));
end; $$;

-- --- Voor de app (als de ingelogde gebruiker) ------------------------------------------------------------------

create or replace function public.mijn_toegangssleutels(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object('sleutels', coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 'naam', naam, 'aangemaakt', aangemaakt, 'laatst', laatst) order by id)
    from private.toegangssleutels where gebruiker_id = v_id and not weg), '[]'::jsonb));
end; $$;

create or replace function public.toegangssleutel_weg(p_naam text, p_wachtwoord text, p_id bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  update private.toegangssleutels set weg = true, cred_id = 'weg:' || id, sleutel = '{}'::jsonb
  where id = p_id and gebruiker_id = v_id;
  return jsonb_build_object('ok', true);
end; $$;

-- --- Herstel per mail -------------------------------------------------------------------------------------------

-- Verstuurt een mail via Brevo (de sleutel staat alleen in de database). Geeft false als er geen mail is ingesteld.
create or replace function private.mail_sturen(p_aan text, p_onderwerp text, p_tekst text)
returns boolean language plpgsql security definer set search_path to '' as $$
declare p private.platform;
begin
  select * into p from private.platform where id = 1;
  if coalesce(p.mail_sleutel, '') = '' or coalesce(p.mail_afzender, '') = '' then return false; end if;
  perform net.http_post(url := 'https://api.brevo.com/v3/smtp/email',
    body := jsonb_build_object('sender', jsonb_build_object('email', p.mail_afzender, 'name', 'Mijn assistent'),
                               'to', jsonb_build_array(jsonb_build_object('email', p_aan)),
                               'subject', p_onderwerp, 'textContent', p_tekst),
    headers := jsonb_build_object('Content-Type', 'application/json', 'accept', 'application/json',
                                  'api-key', p.mail_sleutel));
  return true;
end; $$;

create or replace function public.mail_ingesteld()
returns boolean language sql stable security definer set search_path to '' as $$
  select coalesce(mail_sleutel, '') <> '' and coalesce(mail_afzender, '') <> '' from private.platform where id = 1
$$;

-- Alleen de eigenaar: de sleutel van Brevo en het afzenderadres. De sleutel wordt nooit teruggegeven.
create or replace function public.mail_instellen(p_naam text, p_wachtwoord text, p_sleutel text, p_afzender text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_afzender text := lower(trim(coalesce(p_afzender, '')));
begin
  if v_id is distinct from 1 then return jsonb_build_object('geen_toegang', true); end if;
  if v_afzender !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' then return jsonb_build_object('fout', 'Vul een geldig mailadres in.'); end if;
  if coalesce(trim(p_sleutel), '') <> '' and trim(p_sleutel) !~ '^xkeysib-[A-Za-z0-9-]{20,200}$' then
    return jsonb_build_object('fout', 'Dit lijkt geen API-sleutel van Brevo (die begint met xkeysib-).');
  end if;
  update private.platform set mail_afzender = v_afzender,
    mail_sleutel = case when coalesce(trim(p_sleutel), '') = '' then mail_sleutel else trim(p_sleutel) end
  where id = 1;
  return jsonb_build_object('ok', true);
end; $$;

create or replace function public.herstel_aanvragen(p_email text, p_apparaat text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_email text := lower(trim(coalesce(p_email, ''))); g private.gebruikers; v_code text;
begin
  if not public.mail_ingesteld() then
    return jsonb_build_object('fout', 'Herstel per mail is nog niet beschikbaar.');
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' then return jsonb_build_object('fout', 'Vul je mailadres in.'); end if;
  select * into g from private.gebruikers where lower(email) = v_email and not verwijderd and not geblokkeerd;
  -- Hoogstens 3 mails per uur per account, en 200 per uur in totaal.
  if g.id is not null
     and (select count(*) from private.herstel where gebruiker_id = g.id and aangemaakt > now() - interval '1 hour') < 3
     and (select count(*) from private.herstel where aangemaakt > now() - interval '1 hour') < 200 then
    v_code := lpad((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint % 1000000)::text, 6, '0');
    update private.herstel set gebruikt = true where gebruiker_id = g.id and not gebruikt;
    insert into private.herstel (gebruiker_id, code_hash, geldig_tot)
    values (g.id, private.hash(g.id || ':' || v_code), now() + interval '15 minutes');
    perform private.mail_sturen(g.email, 'Je herstelcode: ' || v_code,
      'Hallo ' || coalesce(nullif(g.weergavenaam, ''), g.naam, '') || E',\n\n'
      || 'Je herstelcode voor Mijn assistent is: ' || v_code || E'\n\n'
      || E'De code is 15 minuten geldig. Heb jij dit niet gevraagd? Dan kun je deze mail negeren; '
      || E'je wachtwoord blijft hetzelfde.\n');
    insert into private.inlogs (gebruiker, apparaat, gelukt, reden) values (g.id, left(p_apparaat, 80), true, 'herstel_mail');
  end if;
  return jsonb_build_object('ok', true);
end; $$;

create or replace function public.herstel_afronden(p_email text, p_code text, p_nieuw_wachtwoord text, p_twee_stap text,
                                                   p_apparaat text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_email text := lower(trim(coalesce(p_email, ''))); g private.gebruikers; h private.herstel;
  v_code text := regexp_replace(coalesce(p_code, ''), '[^0-9]', '', 'g');
begin
  select * into g from private.gebruikers where lower(email) = v_email and not verwijderd and not geblokkeerd;
  if g.id is not null then
    select * into h from private.herstel where gebruiker_id = g.id and not gebruikt and geldig_tot > now()
    order by id desc limit 1 for update;
  end if;
  if h.id is null then return jsonb_build_object('fout', 'Deze code is verlopen. Vraag een nieuwe aan.'); end if;
  if h.pogingen >= 5 then
    update private.herstel set gebruikt = true where id = h.id;
    return jsonb_build_object('fout', 'Te vaak geprobeerd. Vraag een nieuwe code aan.');
  end if;
  if private.hash(g.id || ':' || v_code) <> h.code_hash then
    update private.herstel set pogingen = pogingen + 1 where id = h.id;
    return jsonb_build_object('fout', 'Deze code klopt niet.');
  end if;
  if length(coalesce(p_nieuw_wachtwoord, '')) < 10 then
    return jsonb_build_object('fout', 'Kies een wachtwoord van minstens 10 tekens.');
  end if;
  if g.totp_aan then
    if coalesce(p_twee_stap, '') = '' then return jsonb_build_object('code_nodig', true); end if;
    if not private.code_klopt(g.id, p_twee_stap) then
      update private.herstel set pogingen = pogingen + 1 where id = h.id;
      return jsonb_build_object('code_nodig', true, 'fout', 'Deze code uit je app klopt niet.');
    end if;
  end if;
  update private.herstel set gebruikt = true where id = h.id;
  update private.gebruikers set hash = extensions.crypt(p_nieuw_wachtwoord, extensions.gen_salt('bf', 10)) where id = g.id;
  -- Overal uitloggen: wie je oude wachtwoord had, komt er niet meer in.
  update private.sessies set verloopt = now() where gebruiker = g.id and verloopt > now();
  update private.apparaten set ingetrokken = true where gebruiker = g.id and not ingetrokken;
  insert into private.inlogs (gebruiker, apparaat, gelukt, reden) values (g.id, left(p_apparaat, 80), true, 'herstel');
  perform private.mail_sturen(g.email, 'Je wachtwoord is gewijzigd',
    E'Je wachtwoord voor Mijn assistent is zojuist gewijzigd en je bent op andere apparaten uitgelogd.\n\n'
    || E'Was jij dit niet? Vraag dan meteen een nieuwe herstelcode aan en kies een nieuw wachtwoord.\n');
  return jsonb_build_object('token', private.nieuwe_sessie(g.id, p_apparaat), 'naam', coalesce(g.naam, ''));
end; $$;

revoke all on function private.mail_sturen(text, text, text) from public, anon, authenticated;
revoke all on function public.sleutel_instellingen(), public.sleutel_gebruiker(text, text),
  public.sleutel_opslaan(bigint, text, integer, jsonb, bigint, text, text), public.sleutel_zoeken(text),
  public.sleutel_inloggen(bigint, bigint, text, text) from public, anon, authenticated;
grant execute on function public.sleutel_instellingen(), public.sleutel_gebruiker(text, text),
  public.sleutel_opslaan(bigint, text, integer, jsonb, bigint, text, text), public.sleutel_zoeken(text),
  public.sleutel_inloggen(bigint, bigint, text, text) to service_role;
grant execute on function public.mijn_toegangssleutels(text, text), public.toegangssleutel_weg(text, text, bigint),
  public.mail_ingesteld(), public.mail_instellen(text, text, text, text), public.herstel_aanvragen(text, text),
  public.herstel_afronden(text, text, text, text, text) to anon, authenticated;
