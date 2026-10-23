-- Privacy in de chat, zoals bij Signal en WhatsApp:
--   leesbevestigingen uit: anderen zien geen blauwe vinkjes van jou, en jij ziet ze dan ook niet bij hen
--     (wederkerig, en de server dwingt het af: hij geeft dan alleen 'ontvangen' door, nooit 'gelezen');
--   standaardtimer: nieuwe gesprekken die jij start, krijgen meteen verdwijnende berichten;
--   een lijst van wie je hebt geblokkeerd, om iemand weer te deblokkeren.
-- Alleen toevoegen of vervangen, niets weggooien.

create table if not exists private.chat_voorkeuren (
  gebruiker bigint primary key references private.gebruikers(id),
  leesbevestigingen boolean not null default true,
  standaard_timer integer check (standaard_timer is null or standaard_timer between 300 and 7776000),
  bijgewerkt timestamptz not null default now()
);
alter table private.chat_voorkeuren enable row level security;

create or replace function private.chat_leest_mee(p_gebruiker bigint)
returns boolean language sql stable security definer set search_path to '' as $$
  select coalesce((select leesbevestigingen from private.chat_voorkeuren where gebruiker = p_gebruiker), true)
$$;

create or replace function private.chat_gesprek_json(g private.chat_gesprekken, p_ik bigint)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('id', g.id, 'soort', g.soort, 'naam', g.naam, 'verdwijnen', g.verdwijnen,
    'laatst', g.laatst, 'status', l.status, 'beheerder', l.beheerder, 'stil', l.stil,
    'community', g.community, 'alleen_beheer', g.alleen_beheer,
    'community_naam', (select c.naam from private.chat_communities c where c.id = g.community),
    'ongelezen', (select count(*) from private.chat_berichten b where b.gesprek = g.id and b.id > l.gelezen_tot
                  and b.afzender <> p_ik and not b.weg),
    'laatste_id', (select max(b.id) from private.chat_berichten b where b.gesprek = g.id),
    'vast', coalesce((select jsonb_agg(b.id order by b.id) from private.chat_berichten b
                      where b.gesprek = g.id and b.vast and not b.weg), '[]'::jsonb),
    'leden', coalesce((select jsonb_agg(jsonb_build_object('id', x.gebruiker, 'naam', private.weergave(x.gebruiker),
        'gebruikersnaam', u.naam, 'status', x.status, 'beheerder', x.beheerder,
        -- Gelezen alleen als jullie allebei leesbevestigingen aan hebben (je eigen stand zie je altijd).
        'gelezen_tot', case when x.gebruiker = p_ik or (private.chat_leest_mee(p_ik) and private.chat_leest_mee(x.gebruiker))
                            then x.gelezen_tot else 0 end,
        'ontvangen_tot', greatest(x.ontvangen_tot, x.gelezen_tot),
        'contact', private.chat_is_contact(p_ik, x.gebruiker))
        order by x.gebruiker)
      from private.chat_leden x join private.gebruikers u on u.id = x.gebruiker
      where x.gesprek = g.id and x.status <> 'weg'), '[]'::jsonb))
  from private.chat_leden l where l.gesprek = g.id and l.gebruiker = p_ik
$$;

-- Nieuwe gesprekken (niet de kanalen van een community) krijgen de standaardtimer van wie ze start.
create or replace function private.chat_standaard_timer()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.verdwijnen is null and new.community is null then
    new.verdwijnen := (select standaard_timer from private.chat_voorkeuren where gebruiker = new.maker);
  end if;
  return new;
end; $$;
create or replace trigger chat_standaard_timer before insert on private.chat_gesprekken
  for each row execute function private.chat_standaard_timer();

create or replace function public.chat_voorkeuren(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v private.chat_voorkeuren;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into v from private.chat_voorkeuren where gebruiker = v_id;
  return jsonb_build_object('leesbevestigingen', coalesce(v.leesbevestigingen, true),
    'standaard_timer', coalesce(v.standaard_timer, 0),
    'geblokkeerd', coalesce((select jsonb_agg(jsonb_build_object('id', b.geblokkeerd, 'naam', private.weergave(b.geblokkeerd),
        'gebruikersnaam', u.naam) order by b.aangemaakt desc)
      from private.chat_blokkades b join private.gebruikers u on u.id = b.geblokkeerd
      where b.gebruiker = v_id and not b.weg), '[]'::jsonb));
end; $$;

-- Leeg (null) = laten zoals het is.
create or replace function public.chat_voorkeuren_zetten(p_naam text, p_wachtwoord text, p_leesbevestigingen boolean,
                                                         p_standaard_timer integer)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if p_standaard_timer is not null and p_standaard_timer not in (0, 3600, 86400, 604800, 7776000) then
    return jsonb_build_object('fout', 'Kies een van de vaste tijden.');
  end if;
  insert into private.chat_voorkeuren (gebruiker) values (v_id) on conflict (gebruiker) do nothing;
  update private.chat_voorkeuren set
    leesbevestigingen = coalesce(p_leesbevestigingen, leesbevestigingen),
    standaard_timer = case when p_standaard_timer is null then standaard_timer else nullif(p_standaard_timer, 0) end,
    bijgewerkt = now()
  where gebruiker = v_id;
  return public.chat_voorkeuren(p_naam, p_wachtwoord);
end; $$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function public.chat_voorkeuren(text, text), public.chat_voorkeuren_zetten(text, text, boolean, integer) from public;
grant execute on function public.chat_voorkeuren(text, text), public.chat_voorkeuren_zetten(text, text, boolean, integer)
  to anon, authenticated;
