-- Documenten: teksten maken en bewerken in de app, op elk apparaat (iPad, iPhone, Mac, Windows) met een browser.
--
-- Elk document heeft een versienummer. Wie opslaat, geeft het versienummer mee dat hij geopend had; is het document
-- intussen op een ander apparaat gewijzigd, dan krijgt hij de nieuwste versie terug in plaats van die te overschrijven.
-- Bij het opslaan bewaart de database hooguit elke tien minuten een eerdere versie (30 per document, de oudste wordt
-- hergebruikt). Weggooien gaat via de prullenbak; definitief weggooien maakt de inhoud leeg. Rijen blijven
-- altijd bestaan.

create table if not exists private.documenten (
  id bigint generated always as identity primary key,
  gebruiker_id bigint not null references private.gebruikers(id),
  titel text not null default 'Naamloos document',
  inhoud jsonb,                         -- de tekst zoals de editor hem bewaart (Quill-delta); leeg = gebruik html
  html text not null default '',        -- dezelfde tekst als html, voor exporteren en voor de assistent
  tekst text not null default '',       -- platte tekst, om te zoeken
  versie integer not null default 1,
  apparaat text not null default '',
  weg boolean not null default false,   -- in de prullenbak
  gewist boolean not null default false,-- definitief verwijderd: inhoud is leeggemaakt
  aangemaakt timestamptz not null default now(),
  gewijzigd timestamptz not null default now()
);
create index if not exists documenten_gebruiker on private.documenten (gebruiker_id, gewijzigd desc);
alter table private.documenten enable row level security;

create table if not exists private.document_versies (
  id bigint generated always as identity primary key,
  document_id bigint not null references private.documenten(id),
  slot integer not null,
  versie integer not null,
  titel text not null default '',
  inhoud jsonb,
  html text not null default '',
  tekst text not null default '',
  apparaat text not null default '',
  bewaard timestamptz not null default now(),
  unique (document_id, slot)
);
alter table private.document_versies enable row level security;

create or replace function private.document_kort(d private.documenten)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('id', d.id, 'titel', d.titel, 'gewijzigd', d.gewijzigd, 'aangemaakt', d.aangemaakt,
                            'apparaat', d.apparaat, 'versie', d.versie, 'weg', d.weg,
                            'fragment', left(regexp_replace(d.tekst, '\s+', ' ', 'g'), 160),
                            'woorden', coalesce(array_length(regexp_split_to_array(trim(d.tekst), '\s+'), 1), 0)
                                       * (trim(d.tekst) <> '')::int)
$$;

create or replace function private.document_vol(d private.documenten)
returns jsonb language sql stable security definer set search_path to '' as $$
  select private.document_kort(d) || jsonb_build_object('inhoud', d.inhoud, 'html', d.html, 'tekst', d.tekst)
$$;

-- Bewaart de huidige inhoud als eerdere versie, als de laatste bewaarde versie ouder is dan tien minuten.
create or replace function private.document_versie_bewaren(d private.documenten, p_altijd boolean)
returns void language plpgsql security definer set search_path to '' as $$
declare v_laatst timestamptz; v_aantal integer; v_slot integer;
begin
  if d.tekst = '' and d.html = '' then return; end if;
  select max(bewaard), count(*) into v_laatst, v_aantal from private.document_versies where document_id = d.id;
  if not p_altijd and v_laatst is not null and v_laatst > now() - interval '10 minutes' then return; end if;
  if v_aantal < 30 then
    insert into private.document_versies (document_id, slot, versie, titel, inhoud, html, tekst, apparaat)
    values (d.id, v_aantal, d.versie, d.titel, d.inhoud, d.html, d.tekst, d.apparaat);
  else
    select slot into v_slot from private.document_versies where document_id = d.id order by bewaard limit 1;
    update private.document_versies
    set versie = d.versie, titel = d.titel, inhoud = d.inhoud, html = d.html, tekst = d.tekst, apparaat = d.apparaat,
        bewaard = now()
    where document_id = d.id and slot = v_slot;
  end if;
end; $$;

create or replace function public.documenten_lijst(p_naam text, p_wachtwoord text, p_zoek text, p_prullenbak boolean)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object('documenten', coalesce((
    select jsonb_agg(private.document_kort(d) order by d.gewijzigd desc)
    from (select * from private.documenten d
          where d.gebruiker_id = v_id and not d.gewist and d.weg = coalesce(p_prullenbak, false)
            and (coalesce(trim(p_zoek), '') = ''
                 or d.titel ilike '%' || trim(p_zoek) || '%' or d.tekst ilike '%' || trim(p_zoek) || '%')
          order by d.gewijzigd desc limit 500) d
  ), '[]'::jsonb));
end; $$;

create or replace function public.document_lezen(p_naam text, p_wachtwoord text, p_id bigint)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); d private.documenten;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into d from private.documenten where id = p_id and gebruiker_id = v_id and not gewist;
  if d.id is null then return jsonb_build_object('fout', 'Dit document bestaat niet (meer).'); end if;
  return jsonb_build_object('document', private.document_vol(d));
end; $$;

-- Alleen het versienummer: zo ziet een open scherm snel of het document ergens anders is gewijzigd.
create or replace function public.document_stand(p_naam text, p_wachtwoord text, p_id bigint)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return coalesce((select jsonb_build_object('versie', versie, 'apparaat', apparaat, 'gewijzigd', gewijzigd, 'weg', weg)
                   from private.documenten where id = p_id and gebruiker_id = v_id and not gewist),
                  jsonb_build_object('fout', 'Dit document bestaat niet (meer).'));
end; $$;

-- p_id leeg = nieuw document. p_versie leeg = altijd opslaan (de assistent die iets toevoegt, of "mijn versie bewaren").
-- p_titel leeg = titel niet wijzigen. p_inhoud leeg = de editor bouwt de tekst op uit p_html.
create or replace function public.document_opslaan(p_naam text, p_wachtwoord text, p_id bigint, p_titel text,
                                                   p_inhoud jsonb, p_html text, p_tekst text, p_versie integer,
                                                   p_apparaat text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); d private.documenten;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if octet_length(coalesce(p_html, '')) + octet_length(coalesce(p_inhoud::text, '')) > 6000000 then
    return jsonb_build_object('fout', 'Dit document is te groot (meer dan 6 MB). Gebruik kleinere of minder foto''s.');
  end if;
  if p_id is null then
    if (select count(*) from private.documenten where gebruiker_id = v_id and not gewist) >= 2000 then
      return jsonb_build_object('fout', 'Je kunt maximaal 2000 documenten hebben. Leeg eerst je prullenbak.');
    end if;
    insert into private.documenten (gebruiker_id, titel, inhoud, html, tekst, apparaat)
    values (v_id, coalesce(nullif(left(trim(coalesce(p_titel, '')), 200), ''), 'Naamloos document'), p_inhoud,
            coalesce(p_html, ''), coalesce(p_tekst, ''), left(coalesce(p_apparaat, ''), 80))
    returning * into d;
    return jsonb_build_object('document', private.document_kort(d));
  end if;
  select * into d from private.documenten where id = p_id and gebruiker_id = v_id and not gewist for update;
  if d.id is null then return jsonb_build_object('fout', 'Dit document bestaat niet (meer).'); end if;
  if p_versie is not null and p_versie <> d.versie then
    return jsonb_build_object('conflict', true, 'document', private.document_vol(d));
  end if;
  perform private.document_versie_bewaren(d, false);
  update private.documenten
  set titel = coalesce(nullif(left(trim(coalesce(p_titel, '')), 200), ''), titel),
      inhoud = case when p_html is null then inhoud else p_inhoud end,
      html = coalesce(p_html, html), tekst = coalesce(p_tekst, tekst),
      versie = versie + 1, apparaat = left(coalesce(p_apparaat, ''), 80), gewijzigd = now()
  where id = d.id
  returning * into d;
  return jsonb_build_object('document', private.document_kort(d));
end; $$;

-- Naar de prullenbak (p_weg true) of terugzetten (p_weg false).
create or replace function public.document_weg(p_naam text, p_wachtwoord text, p_id bigint, p_weg boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  update private.documenten set weg = coalesce(p_weg, true), gewijzigd = now()
  where id = p_id and gebruiker_id = v_id and not gewist;
  return jsonb_build_object('ok', true);
end; $$;

-- Definitief verwijderen uit de prullenbak: de inhoud en alle eerdere versies worden leeggemaakt.
create or replace function public.document_wissen(p_naam text, p_wachtwoord text, p_id bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  update private.document_versies v set titel = '', inhoud = null, html = '', tekst = ''
  from private.documenten d where d.id = v.document_id and d.id = p_id and d.gebruiker_id = v_id and d.weg;
  update private.documenten set gewist = true, titel = '', inhoud = null, html = '', tekst = ''
  where id = p_id and gebruiker_id = v_id and weg;
  return jsonb_build_object('ok', true);
end; $$;

create or replace function public.document_versies(p_naam text, p_wachtwoord text, p_id bigint)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object('versies', coalesce((
    select jsonb_agg(jsonb_build_object('id', v.id, 'versie', v.versie, 'titel', v.titel, 'bewaard', v.bewaard,
                                        'apparaat', v.apparaat,
                                        'fragment', left(regexp_replace(v.tekst, '\s+', ' ', 'g'), 160))
                     order by v.bewaard desc)
    from private.document_versies v join private.documenten d on d.id = v.document_id
    where d.id = p_id and d.gebruiker_id = v_id and not d.gewist and (v.tekst <> '' or v.html <> '')
  ), '[]'::jsonb));
end; $$;

-- Een eerdere versie terugzetten. De huidige tekst wordt eerst zelf als versie bewaard, dus terugzetten is omkeerbaar.
create or replace function public.document_versie_terugzetten(p_naam text, p_wachtwoord text, p_versie_id bigint,
                                                              p_apparaat text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); d private.documenten; v private.document_versies;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into v from private.document_versies where id = p_versie_id;
  select * into d from private.documenten where id = v.document_id and gebruiker_id = v_id and not gewist for update;
  if d.id is null then return jsonb_build_object('fout', 'Deze versie bestaat niet (meer).'); end if;
  perform private.document_versie_bewaren(d, true);
  update private.documenten
  set titel = coalesce(nullif(v.titel, ''), titel), inhoud = v.inhoud, html = v.html, tekst = v.tekst,
      versie = versie + 1, apparaat = left(coalesce(p_apparaat, ''), 80), gewijzigd = now(), weg = false
  where id = d.id
  returning * into d;
  return jsonb_build_object('document', private.document_kort(d));
end; $$;

-- Account verwijderen: zoals in winkelkaart.sql, en nu ook alle documenten leegmaken.
create or replace function public.account_verwijderen(p_naam text, p_wachtwoord text)
returns boolean language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null or v_id = 1 then return false; end if;
  if exists (select 1 from private.bestellingen where (koper = v_id or verkoper = v_id)
             and status in ('betaald', 'geleverd', 'geschil')) then
    return false;
  end if;
  update public.gegevens set data = '{}'::jsonb where id = v_id;
  update private.media set verwijderd = true, inhoud = ''::bytea where gebruiker_id = v_id;
  update private.aanbod set actief = false, omschrijving = '', contact = '', in_winkel = false where gebruiker_id = v_id;
  update private.winkels set open = false, omschrijving = '', retour = '', winkeladres = '', lat = null, lon = null where gebruiker_id = v_id;
  update private.ruimtes set weg = true, openbaar = false, titel = '', omschrijving = '' where gebruiker_id = v_id;
  update private.ruimte_items i set weg = true, data = '', klein = '', titel = '', tekst = ''
  from private.ruimtes r where r.id = i.ruimte_id and r.gebruiker_id = v_id;
  update private.document_versies v set titel = '', inhoud = null, html = '', tekst = ''
  from private.documenten d where d.id = v.document_id and d.gebruiker_id = v_id;
  update private.documenten set weg = true, gewist = true, titel = '', inhoud = null, html = '', tekst = ''
  where gebruiker_id = v_id;
  update private.project_leden set actief = false where gebruiker_id = v_id;
  update private.gebruikers set verwijderd = true, naam = null, email = null, weergavenaam = 'Verwijderd account',
         hash = extensions.crypt(extensions.gen_random_uuid()::text, extensions.gen_salt('bf', 4))
  where id = v_id;
  return true;
end; $$;

-- --- Rechten --------------------------------------------------------------------------------

revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function
  public.documenten_lijst(text, text, text, boolean), public.document_lezen(text, text, bigint),
  public.document_stand(text, text, bigint),
  public.document_opslaan(text, text, bigint, text, jsonb, text, text, integer, text),
  public.document_weg(text, text, bigint, boolean), public.document_wissen(text, text, bigint),
  public.document_versies(text, text, bigint), public.document_versie_terugzetten(text, text, bigint, text),
  public.account_verwijderen(text, text)
  from public;
grant execute on function
  public.documenten_lijst(text, text, text, boolean), public.document_lezen(text, text, bigint),
  public.document_stand(text, text, bigint),
  public.document_opslaan(text, text, bigint, text, jsonb, text, text, integer, text),
  public.document_weg(text, text, bigint, boolean), public.document_wissen(text, text, bigint),
  public.document_versies(text, text, bigint), public.document_versie_terugzetten(text, text, bigint, text),
  public.account_verwijderen(text, text)
  to anon, authenticated;
