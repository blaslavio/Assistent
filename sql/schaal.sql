-- Klaar voor duizenden gebruikers: indexen op alles waar vaak op gezocht wordt, en de chat zo dat een kanaal met
-- veel berichten en veel leden niet trager wordt naarmate het groeit. Gemeten met 5.000 testgebruikers.

create index if not exists aanbod_gebruiker on private.aanbod (gebruiker_id);
create index if not exists aanbod_actief_nieuw on private.aanbod (aangemaakt desc) where actief and not geblokkeerd;
create index if not exists bestellingen_koper on private.bestellingen (koper);
create index if not exists bestellingen_verkoper on private.bestellingen (verkoper, status);
create index if not exists bestellingen_aanbod on private.bestellingen (aanbod_id);
create index if not exists bestellingen_tijdslot on private.bestellingen (tijdslot_id) where tijdslot_id is not null;
create index if not exists berichten_van on private.berichten (van);
create index if not exists berichten_aan on private.berichten (aan);
create index if not exists berichten_aanbod on private.berichten (aanbod_id);
create index if not exists beoordelingen_over on private.beoordelingen (over);
create index if not exists beoordelingen_door on private.beoordelingen (door);
create index if not exists bezoek_beoordelingen_over on private.bezoek_beoordelingen (over);
create index if not exists bezoek_beoordelingen_door on private.bezoek_beoordelingen (door);
create index if not exists bezoekcodes_verkoper on private.bezoekcodes (verkoper);
create index if not exists tijdsloten_aanbod on private.tijdsloten (aanbod_id);
create index if not exists tijdsloten_geboekt_door on private.tijdsloten (geboekt_door) where geboekt_door is not null;
create index if not exists biedingen_aanbod on private.biedingen (aanbod_id);
create index if not exists meldingen_aanbod on private.meldingen (aanbod_id);
create index if not exists meldingen_door on private.meldingen (door);
create index if not exists chat_berichten_afzender on private.chat_berichten (afzender, aangemaakt);
create index if not exists chat_berichten_apparaat on private.chat_berichten (apparaat);
create index if not exists chat_gesprekken_maker on private.chat_gesprekken (maker);
create index if not exists chat_blokkades_geblokkeerd on private.chat_blokkades (geblokkeerd);
create index if not exists chat_communities_maker on private.chat_communities (maker);
create index if not exists gedeeld_aan on private.gedeeld (aan);
create index if not exists gedeeld_van on private.gedeeld (van);
create index if not exists agenda_delen_met on private.agenda_delen (met);
create index if not exists agenda_reacties_door on private.agenda_reacties (door);
create index if not exists project_leden_gebruiker on private.project_leden (gebruiker_id);
create index if not exists project_items_project on private.project_items (project_id);
create index if not exists projecten_eigenaar on private.projecten (eigenaar);
create index if not exists peilingen_eigenaar on private.peilingen (eigenaar);
create index if not exists peiling_stemmen_gebruiker on private.peiling_stemmen (gebruiker);
create index if not exists gezinnen_eigenaar on private.gezinnen (eigenaar);
create index if not exists ruimtes_gebruiker on private.ruimtes (gebruiker_id);
create index if not exists winkel_volgers_volger on private.winkel_volgers (volger);
create index if not exists winkel_nieuws_verkoper on private.winkel_nieuws (verkoper);
create index if not exists herstelcodes_gebruiker on private.herstelcodes (gebruiker);
create index if not exists reserveringen_bezoek on private.reserveringen (bezoek_id);

-- Zonder deelnemerslijst: voor het telkens bijwerken van een groot kanaal waarin niets nieuws is.
create or replace function private.chat_gesprek_kort(g private.chat_gesprekken, p_ik bigint)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('id', g.id, 'soort', g.soort, 'naam', g.naam, 'verdwijnen', g.verdwijnen,
    'laatst', g.laatst, 'status', l.status, 'beheerder', l.beheerder, 'stil', l.stil,
    'community', g.community, 'alleen_beheer', g.alleen_beheer,
    'community_naam', (select c.naam from private.chat_communities c where c.id = g.community),
    'ongelezen', 0,
    'laatste_id', (select max(b.id) from private.chat_berichten b where b.gesprek = g.id),
    'vast', coalesce((select jsonb_agg(b.id order by b.id) from private.chat_berichten b
                      where b.gesprek = g.id and b.vast and not b.weg), '[]'::jsonb),
    'leden', null)
  from private.chat_leden l where l.gesprek = g.id and l.gebruiker = p_ik
$$;

-- Berichten: met p_na = 0 de laatste 200, daarna alles na dat nummer. Alleen de sleutel voor dit apparaat.
-- Eerst de nieuwste berichten via de index, pas daarna de sleutel zoeken: zo blijft het snel, hoe lang het
-- gesprek ook is. In een community-kanaal zonder nieuwe berichten komt de deelnemerslijst niet opnieuw mee.
create or replace function public.chat_berichten(p_naam text, p_wachtwoord text, p_gesprek bigint, p_na bigint,
                                                 p_apparaat bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_sinds timestamptz; v_lijst jsonb; g private.chat_gesprekken;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if private.chat_lid(v_id, p_gesprek) not in ('lid', 'verzoek') or private.chat_lid(v_id, p_gesprek) is null then
    return jsonb_build_object('fout', 'Geen toegang.');
  end if;
  select aangemaakt into v_sinds from private.chat_apparaten where id = p_apparaat and gebruiker = v_id;
  if v_sinds is null then
    v_lijst := '[]'::jsonb;
  else
    select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'afzender', b.afzender, 'apparaat', b.apparaat,
        'aangemaakt', b.aangemaakt, 'verloopt', b.verloopt, 'weg', b.weg, 'vast', b.vast,
        'inhoud', case when b.weg then null else b.inhoud end, 'iv', b.iv, 'epk', b.epk,
        'sleutel', case when b.weg then null else b.sleutels -> p_apparaat::text end,
        'handtekening', b.handtekening, 'teken', a.teken, 'vingerafdruk', a.vingerafdruk) order by b.id), '[]'::jsonb)
    into v_lijst
    from (select k.* from (
            select * from private.chat_berichten x
            where x.gesprek = p_gesprek and x.id > coalesce(p_na, 0) and coalesce(p_na, 0) > 0
            order by x.id limit 300) k
          union all
          select k.* from (
            select * from private.chat_berichten x
            where x.gesprek = p_gesprek and coalesce(p_na, 0) <= 0
            order by x.id desc limit 300) k) b
    join private.chat_apparaten a on a.id = b.apparaat
    where b.sleutels ? p_apparaat::text or (b.weg and b.aangemaakt >= v_sinds);
    if jsonb_array_length(v_lijst) > 200 then
      v_lijst := case when coalesce(p_na, 0) > 0
        then (select jsonb_agg(e order by n) from jsonb_array_elements(v_lijst) with ordinality as t(e, n) where n <= 200)
        else (select jsonb_agg(e order by n) from jsonb_array_elements(v_lijst) with ordinality as t(e, n)
              where n > jsonb_array_length(v_lijst) - 200) end;
    end if;
  end if;
  select * into g from private.chat_gesprekken where id = p_gesprek;
  return jsonb_build_object('berichten', v_lijst,
    'gesprek', case when g.community is not null and coalesce(p_na, 0) > 0 and jsonb_array_length(v_lijst) = 0
                    then private.chat_gesprek_kort(g, v_id) else private.chat_gesprek_json(g, v_id) end);
end; $$;

revoke all on function private.chat_gesprek_kort(private.chat_gesprekken, bigint) from public, anon, authenticated;

-- Inloggen: eerst de gebruiker via de index zoeken, dan één keer het wachtwoord controleren.
-- Voorheen werd bij veel gebruikers het wachtwoord tegen iedereen gecontroleerd (minuten wachten).
create or replace function private.met_wachtwoord(p_naam text, p_wachtwoord text)
returns bigint language plpgsql stable security definer set search_path to '' as $$
declare v_naam text := nullif(lower(trim(coalesce(p_naam, ''))), ''); g private.gebruikers;
begin
  if v_naam is null then
    select * into g from private.gebruikers where id = 1;
  elsif v_naam like '%@%' then
    select * into g from private.gebruikers where lower(email) = v_naam and email is not null;
  else
    select * into g from private.gebruikers where naam = v_naam;
  end if;
  if g.id is null or g.geblokkeerd or g.verwijderd then return null; end if;
  if g.hash = extensions.crypt(coalesce(p_wachtwoord, ''), g.hash) then return g.id; end if;
  return null;
end; $$;

revoke all on function private.met_wachtwoord(text, text) from public, anon, authenticated;

create index if not exists pogingen_naam_tijd on private.pogingen (naam, tijd);
