-- Berichten met gasten: iemand zonder account plant een afspraak in via je boekingspagina en laat een bericht achter.
-- Dat bericht komt bij jou binnen in de chat (onder Gasten). Wat jij terugschrijft gaat per mail naar de gast, met een
-- link waarmee de gast zonder account zijn afspraak en het gesprek ziet en kan antwoorden.
-- Niet end-to-end versleuteld (de gast heeft geen sleutel); dat staat ook in de app. Alleen toevoegen, niets weggooien.

create table if not exists private.gast_berichten (
  id bigint generated always as identity primary key,
  boeking bigint not null references private.boekingen(id),
  van text not null check (van in ('gast', 'eigenaar')),
  tekst text not null check (length(tekst) between 1 and 2000),
  aangemaakt timestamptz not null default now(),
  gelezen boolean not null default false,
  gemaild boolean not null default false
);
create index if not exists gast_berichten_boeking on private.gast_berichten (boeking, id);
-- Links in mails: elke mail krijgt een eigen code (alleen de hash staat hier), 90 dagen geldig.
create table if not exists private.gast_toegang (
  code_hash text primary key,
  boeking bigint not null references private.boekingen(id),
  geldig_tot timestamptz not null
);
alter table private.gast_berichten enable row level security;
alter table private.gast_toegang enable row level security;
revoke all on private.gast_berichten, private.gast_toegang from public, anon, authenticated;

-- De boeking bij een code uit de link: de code van het boeken zelf, of een code uit een mail.
create or replace function private.gast_boeking(p_code text)
returns private.boekingen language sql stable security definer set search_path to '' as $$
  select b.* from private.boekingen b
  where b.klant_id is null and (
    b.code_hash = encode(extensions.digest(coalesce(p_code, ''), 'sha256'), 'hex')
    or b.id = (select t.boeking from private.gast_toegang t
               where t.code_hash = encode(extensions.digest(coalesce(p_code, ''), 'sha256'), 'hex') and t.geldig_tot > now()))
  limit 1
$$;

-- Een nieuwe link voor de gast. Het adres van de app staat in private.platform.app_adres.
create or replace function private.gast_link(p_boeking bigint)
returns text language plpgsql security definer set search_path to '' as $$
declare v_code text := encode(extensions.gen_random_bytes(16), 'hex'); v_adres text;
begin
  insert into private.gast_toegang (code_hash, boeking, geldig_tot)
  values (encode(extensions.digest(v_code, 'sha256'), 'hex'), p_boeking, now() + interval '90 days');
  select rtrim(coalesce(nullif(app_adres, ''), ''), '/') into v_adres from private.platform where id = 1;
  return coalesce(v_adres, '') || '/?boeking=' || v_code;
end; $$;

create or replace function private.gast_tijd(p timestamptz)
returns text language sql immutable set search_path to '' as $$
  select to_char(p at time zone 'Europe/Amsterdam', 'DD-MM-YYYY "om" HH24:MI')
$$;

-- Bij een nieuwe boeking zonder account: het bericht van de gast komt in het gesprek, en de gast krijgt een mail.
create or replace function private.gast_na_boeken()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.klant_id is not null then return new; end if;
  if trim(coalesce(new.notitie, '')) <> '' then
    insert into private.gast_berichten (boeking, van, tekst) values (new.id, 'gast', left(trim(new.notitie), 2000));
  end if;
  if public.mail_ingesteld() then
    perform private.mail_sturen(new.email,
      case when new.status = 'aangevraagd' then 'Je aanvraag bij ' else 'Je afspraak bij ' end || private.weergave(new.gebruiker_id),
      'Hallo ' || new.naam || E',\n\n'
      || case when new.status = 'aangevraagd' then 'Je hebt een afspraak aangevraagd: ' else 'Je afspraak staat: ' end
      || new.soort || ' op ' || private.gast_tijd(new.start) || E'.\n\n'
      || E'Je afspraak bekijken, annuleren of een bericht sturen kan hier:\n' || private.gast_link(new.id) || E'\n\n'
      || E'Antwoorden op deze mail komt niet aan; gebruik de link.\n');
  end if;
  return new;
end; $$;
drop trigger if exists gast_na_boeken on private.boekingen;
create trigger gast_na_boeken after insert on private.boekingen for each row execute function private.gast_na_boeken();

-- Bevestigd of afgewezen: de gast hoort het per mail.
create or replace function private.gast_na_wijzigen()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.klant_id is null and new.status is distinct from old.status and new.status in ('bevestigd', 'afgewezen')
     and public.mail_ingesteld() then
    perform private.mail_sturen(new.email,
      case when new.status = 'bevestigd' then 'Je afspraak is bevestigd' else 'Je aanvraag kan niet doorgaan' end,
      'Hallo ' || new.naam || E',\n\n' || private.weergave(new.gebruiker_id)
      || case when new.status = 'bevestigd' then ' heeft je afspraak bevestigd: ' else ' kan helaas niet op dit moment: ' end
      || new.soort || ' op ' || private.gast_tijd(new.start) || E'.\n\n'
      || E'Je afspraak bekijken of een bericht sturen kan hier:\n' || private.gast_link(new.id) || E'\n');
  end if;
  return new;
end; $$;
drop trigger if exists gast_na_wijzigen on private.boekingen;
create trigger gast_na_wijzigen after update of status on private.boekingen for each row
  execute function private.gast_na_wijzigen();

-- Wat de gast ziet: de afspraak en het gesprek. Geen gegevens van de eigenaar behalve de weergavenaam.
create or replace function public.gast_bekijken(p_code text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare b private.boekingen := private.gast_boeking(p_code); p private.boekpaginas;
begin
  if b.id is null then return jsonb_build_object('fout', 'Deze link werkt niet (meer).'); end if;
  select * into p from private.boekpaginas where gebruiker_id = b.gebruiker_id;
  update private.gast_berichten set gelezen = true where boeking = b.id and van = 'eigenaar' and not gelezen;
  return jsonb_build_object('soort', b.soort, 'start', b.start, 'minuten', b.minuten, 'status', b.status,
    'gast', b.naam, 'naam', private.weergave(b.gebruiker_id), 'locatie', coalesce(p.locatie, ''),
    'mag_annuleren', b.status in ('aangevraagd', 'bevestigd') and b.start > now(),
    'berichten', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'van', m.van, 'tekst', m.tekst,
        'aangemaakt', m.aangemaakt) order by m.id) from private.gast_berichten m where m.boeking = b.id), '[]'::jsonb));
end; $$;

create or replace function public.gast_bericht_sturen(p_code text, p_tekst text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare b private.boekingen := private.gast_boeking(p_code); v_tekst text := trim(coalesce(p_tekst, ''));
begin
  if b.id is null then return jsonb_build_object('fout', 'Deze link werkt niet (meer).'); end if;
  if v_tekst = '' then return jsonb_build_object('fout', 'Schrijf eerst een bericht.'); end if;
  if length(v_tekst) > 2000 then return jsonb_build_object('fout', 'Hooguit 2000 tekens.'); end if;
  if (select count(*) from private.gast_berichten where boeking = b.id and van = 'gast'
      and aangemaakt > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('fout', 'Je hebt al veel berichten gestuurd. Probeer het later opnieuw.');
  end if;
  insert into private.gast_berichten (boeking, van, tekst) values (b.id, 'gast', v_tekst);
  perform private.push_inplannen(b.gebruiker_id, now(), 'reservering', 'gast:' || b.id || ':' || extract(epoch from now())::bigint,
    'Bericht van ' || b.naam, left(v_tekst, 120));
  return jsonb_build_object('ok', true);
end; $$;

-- Voor de eigenaar: de gesprekken met gasten, nieuwste eerst.
create or replace function public.gast_gesprekken(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object('mail', public.mail_ingesteld(), 'gesprekken', coalesce((
    select jsonb_agg(x order by x->>'laatst' desc) from (
      select jsonb_build_object('boeking', b.id, 'naam', b.naam, 'soort', b.soort, 'start', b.start, 'status', b.status,
        'laatst', l.aangemaakt, 'tekst', l.tekst, 'van', l.van,
        'ongelezen', (select count(*) from private.gast_berichten m where m.boeking = b.id and m.van = 'gast' and not m.gelezen)) x
      from private.boekingen b
      join lateral (select * from private.gast_berichten m where m.boeking = b.id order by m.id desc limit 1) l on true
      where b.gebruiker_id = v_id and b.klant_id is null
      order by l.aangemaakt desc limit 50) s), '[]'::jsonb));
end; $$;

create or replace function public.gast_gesprek(p_naam text, p_wachtwoord text, p_boeking bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); b private.boekingen;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into b from private.boekingen where id = p_boeking and gebruiker_id = v_id and klant_id is null;
  if b.id is null then return jsonb_build_object('fout', 'Dit gesprek bestaat niet (meer).'); end if;
  update private.gast_berichten set gelezen = true where boeking = b.id and van = 'gast' and not gelezen;
  return jsonb_build_object('boeking', private.boeking_json(b), 'mail', public.mail_ingesteld(),
    'berichten', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'van', m.van, 'tekst', m.tekst,
        'aangemaakt', m.aangemaakt, 'gemaild', m.gemaild) order by m.id)
      from private.gast_berichten m where m.boeking = b.id), '[]'::jsonb));
end; $$;

-- Je antwoord komt in het gesprek en gaat per mail naar de gast, met een link om terug te schrijven.
create or replace function public.gast_antwoorden(p_naam text, p_wachtwoord text, p_boeking bigint, p_tekst text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); b private.boekingen;
  v_tekst text := trim(coalesce(p_tekst, '')); v_gemaild boolean := false; v_wie text;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into b from private.boekingen where id = p_boeking and gebruiker_id = v_id and klant_id is null;
  if b.id is null then return jsonb_build_object('fout', 'Dit gesprek bestaat niet (meer).'); end if;
  if v_tekst = '' then return jsonb_build_object('fout', 'Schrijf eerst een bericht.'); end if;
  if length(v_tekst) > 2000 then return jsonb_build_object('fout', 'Hooguit 2000 tekens.'); end if;
  if (select count(*) from private.gast_berichten m join private.boekingen x on x.id = m.boeking
      where x.gebruiker_id = v_id and m.van = 'eigenaar' and m.aangemaakt > now() - interval '1 hour') >= 30 then
    return jsonb_build_object('fout', 'Je hebt het afgelopen uur al veel berichten gestuurd. Probeer het straks weer.');
  end if;
  v_wie := private.weergave(v_id);
  if public.mail_ingesteld() and b.email <> '' then
    v_gemaild := private.mail_sturen(b.email, 'Bericht van ' || v_wie,
      'Hallo ' || b.naam || E',\n\n' || v_wie || E' schreef over je afspraak (' || b.soort || ' op '
      || private.gast_tijd(b.start) || E'):\n\n' || v_tekst || E'\n\n'
      || E'Terugschrijven kan hier:\n' || private.gast_link(b.id) || E'\n\n'
      || E'Antwoorden op deze mail komt niet aan; gebruik de link.\n');
  end if;
  insert into private.gast_berichten (boeking, van, tekst, gelezen, gemaild) values (b.id, 'eigenaar', v_tekst, false, v_gemaild);
  return jsonb_build_object('ok', true, 'gemaild', v_gemaild);
end; $$;

revoke all on function private.gast_boeking(text), private.gast_link(bigint), private.gast_tijd(timestamptz),
  private.gast_na_boeken(), private.gast_na_wijzigen() from public, anon, authenticated;
revoke all on function public.gast_bekijken(text), public.gast_bericht_sturen(text, text),
  public.gast_gesprekken(text, text), public.gast_gesprek(text, text, bigint),
  public.gast_antwoorden(text, text, bigint, text) from public;
grant execute on function public.gast_bekijken(text), public.gast_bericht_sturen(text, text),
  public.gast_gesprekken(text, text), public.gast_gesprek(text, text, bigint),
  public.gast_antwoorden(text, text, bigint, text) to anon, authenticated;
