-- Budget: inkomsten en uitgaven per gebruiker, los van de rest van de gegevens zodat de app snel blijft
-- (een bankafschrift kan honderden regels hebben). Budgetten, vaste lasten en spaardoelen zijn klein en staan
-- gewoon bij de instellingen.
--
-- Een bedrag is negatief voor een uitgave en positief voor inkomsten. Wie een bankafschrift twee keer inleest,
-- krijgt geen dubbele regels: elke regel heeft een vingerafdruk (sleutel) die per gebruiker uniek is.
-- Weghalen zet weg = true; rijen blijven bestaan.

create table if not exists private.transacties (
  id bigint generated always as identity primary key,
  gebruiker_id bigint not null references private.gebruikers(id),
  datum date not null,
  bedrag numeric(12, 2) not null,
  omschrijving text not null default '',
  tegenpartij text not null default '',
  categorie text not null default '',
  rekening text not null default '',
  bron text not null default 'hand',    -- hand, import of assistent
  sleutel text not null,
  weg boolean not null default false,
  aangemaakt timestamptz not null default now(),
  unique (gebruiker_id, sleutel)
);
create index if not exists transacties_gebruiker_datum on private.transacties (gebruiker_id, datum desc);
alter table private.transacties enable row level security;

create or replace function private.transactie_json(t private.transacties)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('id', t.id, 'datum', t.datum, 'bedrag', t.bedrag, 'omschrijving', t.omschrijving,
                            'tegenpartij', t.tegenpartij, 'categorie', t.categorie, 'rekening', t.rekening,
                            'bron', t.bron, 'sleutel', t.sleutel)
$$;

-- Alle regels tussen twee datums (inclusief), nieuwste eerst.
create or replace function public.transacties_lijst(p_naam text, p_wachtwoord text, p_van date, p_tot date)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object('transacties', coalesce((
    select jsonb_agg(private.transactie_json(t) order by t.datum desc, t.id desc)
    from private.transacties t
    where t.gebruiker_id = v_id and not t.weg and t.datum between p_van and p_tot), '[]'::jsonb));
end; $$;

-- Voegt regels toe (een lijst van objecten). Regels met een sleutel die al bestaat, worden overgeslagen.
-- Geeft terug hoeveel er nieuw zijn.
create or replace function public.transacties_toevoegen(p_naam text, p_wachtwoord text, p_regels jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_nieuw integer;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if jsonb_typeof(p_regels) <> 'array' or jsonb_array_length(p_regels) > 5000 then
    return jsonb_build_object('fout', 'Te veel regels in één keer (hooguit 5000).');
  end if;
  with nieuw as (
    insert into private.transacties (gebruiker_id, datum, bedrag, omschrijving, tegenpartij, categorie, rekening,
                                     bron, sleutel)
    select v_id, (r->>'datum')::date, round((r->>'bedrag')::numeric, 2), left(coalesce(r->>'omschrijving', ''), 300),
           left(coalesce(r->>'tegenpartij', ''), 120), left(coalesce(r->>'categorie', ''), 60),
           left(coalesce(r->>'rekening', ''), 40), left(coalesce(r->>'bron', 'hand'), 20),
           left(coalesce(r->>'sleutel', extensions.gen_random_uuid()::text), 80)
    from jsonb_array_elements(p_regels) r
    where (r->>'datum') is not null and (r->>'bedrag') is not null
    on conflict (gebruiker_id, sleutel) do nothing
    returning 1)
  select count(*) into v_nieuw from nieuw;
  return jsonb_build_object('nieuw', v_nieuw);
end; $$;

-- Categorie of omschrijving van één regel aanpassen.
create or replace function public.transactie_bijwerken(p_naam text, p_wachtwoord text, p_id bigint,
                                                       p_categorie text, p_omschrijving text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_t private.transacties;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  update private.transacties
  set categorie = coalesce(left(p_categorie, 60), categorie), omschrijving = coalesce(left(p_omschrijving, 300), omschrijving)
  where id = p_id and gebruiker_id = v_id and not weg
  returning * into v_t;
  return case when v_t.id is null then null else private.transactie_json(v_t) end;
end; $$;

-- Alle regels van één tegenpartij in één keer een categorie geven (bijvoorbeeld alles van Albert Heijn).
create or replace function public.transacties_categorie(p_naam text, p_wachtwoord text, p_tegenpartij text,
                                                        p_categorie text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_aantal integer;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  update private.transacties set categorie = left(p_categorie, 60)
  where gebruiker_id = v_id and not weg and lower(tegenpartij) = lower(p_tegenpartij) and tegenpartij <> '';
  get diagnostics v_aantal = row_count;
  return jsonb_build_object('aangepast', v_aantal);
end; $$;

create or replace function public.transactie_weg(p_naam text, p_wachtwoord text, p_id bigint)
returns boolean language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return false; end if;
  update private.transacties set weg = true where id = p_id and gebruiker_id = v_id;
  return found;
end; $$;

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
  update private.transacties set weg = true, bedrag = 0, omschrijving = '', tegenpartij = '', rekening = ''
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
  public.transacties_lijst(text, text, date, date), public.transacties_toevoegen(text, text, jsonb),
  public.transactie_bijwerken(text, text, bigint, text, text), public.transacties_categorie(text, text, text, text),
  public.transactie_weg(text, text, bigint), public.account_verwijderen(text, text)
  from public;
grant execute on function
  public.transacties_lijst(text, text, date, date), public.transacties_toevoegen(text, text, jsonb),
  public.transactie_bijwerken(text, text, bigint, text, text), public.transacties_categorie(text, text, text, text),
  public.transactie_weg(text, text, bigint), public.account_verwijderen(text, text)
  to anon, authenticated;
