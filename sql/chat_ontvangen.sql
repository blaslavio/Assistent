-- Vinkjes zoals in WhatsApp: één vinkje = verzonden (staat op de server), twee grijze = ontvangen (het apparaat van
-- de ander heeft het opgehaald), twee blauwe = gelezen. De app van de ontvanger meldt zelf tot welk bericht hij
-- alles binnen heeft (chat_ontvangen); de inhoud blijft versleuteld, de server ziet alleen nummers.

alter table private.chat_leden add column if not exists ontvangen_tot bigint not null default 0;

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
        'gebruikersnaam', u.naam, 'status', x.status, 'beheerder', x.beheerder, 'gelezen_tot', x.gelezen_tot,
        'ontvangen_tot', greatest(x.ontvangen_tot, x.gelezen_tot),
        'contact', private.chat_is_contact(p_ik, x.gebruiker))
        order by x.gebruiker)
      from private.chat_leden x join private.gebruikers u on u.id = x.gebruiker
      where x.gesprek = g.id and x.status <> 'weg'), '[]'::jsonb))
  from private.chat_leden l where l.gesprek = g.id and l.gebruiker = p_ik
$$;

-- Mijn apparaat heeft alle berichten tot nu toe opgehaald.
create or replace function public.chat_ontvangen(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  update private.chat_leden l set ontvangen_tot = m.hoogste
  from (select b.gesprek, max(b.id) as hoogste from private.chat_berichten b
        where b.gesprek in (select gesprek from private.chat_leden where gebruiker = v_id and status = 'lid')
        group by b.gesprek) m
  where l.gesprek = m.gesprek and l.gebruiker = v_id and l.status = 'lid' and l.ontvangen_tot < m.hoogste;
  return jsonb_build_object('ok', true);
end; $$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function public.chat_ontvangen(text, text) from public;
grant execute on function public.chat_ontvangen(text, text) to anon, authenticated;
