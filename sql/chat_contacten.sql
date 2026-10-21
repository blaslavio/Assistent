-- Contacten in de chat. Met je contacten app je direct; een bericht van iemand die jou niet als contact heeft,
-- komt eerst binnen als verzoek. Wie een verzoek accepteert, krijgt de afzender als contact.

create table if not exists private.chat_contacten (
  gebruiker bigint not null references private.gebruikers(id),
  contact bigint not null references private.gebruikers(id),
  aangemaakt timestamptz not null default now(),
  weg boolean not null default false,
  primary key (gebruiker, contact)
);
create index if not exists chat_contacten_contact on private.chat_contacten (contact);
alter table private.chat_contacten enable row level security;

create or replace function private.chat_is_contact(p_van bigint, p_contact bigint)
returns boolean language sql stable security definer set search_path to '' as $$
  select exists (select 1 from private.chat_contacten where gebruiker = p_van and contact = p_contact and not weg)
$$;

create or replace function private.chat_contact_zetten(p_van bigint, p_contact bigint)
returns void language sql security definer set search_path to '' as $$
  insert into private.chat_contacten (gebruiker, contact) values (p_van, p_contact)
  on conflict (gebruiker, contact) do update set weg = false
$$;

create or replace function private.chat_gesprek_json(g private.chat_gesprekken, p_ik bigint)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('id', g.id, 'soort', g.soort, 'naam', g.naam, 'verdwijnen', g.verdwijnen,
    'laatst', g.laatst, 'status', l.status, 'beheerder', l.beheerder, 'stil', l.stil,
    'ongelezen', (select count(*) from private.chat_berichten b where b.gesprek = g.id and b.id > l.gelezen_tot
                  and b.afzender <> p_ik and not b.weg),
    'laatste_id', (select max(b.id) from private.chat_berichten b where b.gesprek = g.id),
    'leden', coalesce((select jsonb_agg(jsonb_build_object('id', x.gebruiker, 'naam', private.weergave(x.gebruiker),
        'gebruikersnaam', u.naam, 'status', x.status, 'beheerder', x.beheerder, 'gelezen_tot', x.gelezen_tot,
        'contact', private.chat_is_contact(p_ik, x.gebruiker))
        order by x.gebruiker)
      from private.chat_leden x join private.gebruikers u on u.id = x.gebruiker
      where x.gesprek = g.id and x.status <> 'weg'), '[]'::jsonb))
  from private.chat_leden l where l.gesprek = g.id and l.gebruiker = p_ik
$$;

create or replace function public.chat_contacten(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object('contacten', coalesce((select jsonb_agg(jsonb_build_object('id', u.id,
      'naam', private.weergave(u.id), 'gebruikersnaam', u.naam, 'chat', private.chat_heeft_apparaat(u.id))
      order by lower(private.weergave(u.id)))
    from private.chat_contacten c join private.gebruikers u on u.id = c.contact
    where c.gebruiker = v_id and not c.weg and not u.verwijderd and not u.geblokkeerd), '[]'::jsonb));
end; $$;

create or replace function public.chat_contact_toevoegen(p_naam text, p_wachtwoord text, p_wie text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_ander bigint;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select id into v_ander from private.gebruikers
  where naam = lower(trim(both '@ ' from coalesce(p_wie, ''))) and not verwijderd and not geblokkeerd;
  if v_ander is null then return jsonb_build_object('fout', 'Geen gebruiker met die naam.'); end if;
  if v_ander = v_id then return jsonb_build_object('fout', 'Dat ben je zelf.'); end if;
  if (select count(*) from private.chat_contacten where gebruiker = v_id and not weg) >= 2000 then
    return jsonb_build_object('fout', 'Je hebt al heel veel contacten.');
  end if;
  perform private.chat_contact_zetten(v_id, v_ander);
  return jsonb_build_object('ok', true, 'id', v_ander, 'naam', private.weergave(v_ander),
                            'chat', private.chat_heeft_apparaat(v_ander));
end; $$;

create or replace function public.chat_contact_weg(p_naam text, p_wachtwoord text, p_wie bigint)
returns boolean language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return false; end if;
  update private.chat_contacten set weg = true where gebruiker = v_id and contact = p_wie;
  return found;
end; $$;

create or replace function public.chat_starten(p_naam text, p_wachtwoord text, p_met text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_ander bigint; v_gesprek bigint;
  v_status text;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select id into v_ander from private.gebruikers
  where naam = lower(trim(both '@ ' from coalesce(p_met, ''))) and not verwijderd and not geblokkeerd;
  if v_ander is null then return jsonb_build_object('fout', 'Geen gebruiker met die naam.'); end if;
  if v_ander = v_id then return jsonb_build_object('fout', 'Dat ben je zelf.'); end if;
  if private.chat_geblokkeerd(v_id, v_ander) then return jsonb_build_object('fout', 'Chatten met deze persoon kan niet.'); end if;
  if not private.chat_heeft_apparaat(v_ander) then
    return jsonb_build_object('fout', 'Deze persoon gebruikt de chat nog niet. Vraag of die de chat één keer opent.');
  end if;
  perform private.chat_contact_zetten(v_id, v_ander);
  v_status := case when private.chat_is_contact(v_ander, v_id) then 'lid' else 'verzoek' end;
  select g.id into v_gesprek from private.chat_gesprekken g
  where g.soort = 'twee' and exists (select 1 from private.chat_leden where gesprek = g.id and gebruiker = v_id)
    and exists (select 1 from private.chat_leden where gesprek = g.id and gebruiker = v_ander) limit 1;
  if v_gesprek is null then
    if (select count(*) from private.chat_gesprekken where maker = v_id and aangemaakt > now() - interval '1 day') >= 50 then
      return jsonb_build_object('fout', 'Je hebt vandaag al veel nieuwe gesprekken gestart.');
    end if;
    insert into private.chat_gesprekken (soort, maker) values ('twee', v_id) returning id into v_gesprek;
    insert into private.chat_leden (gesprek, gebruiker, status) values (v_gesprek, v_id, 'lid'), (v_gesprek, v_ander, v_status);
  else
    update private.chat_leden set status = 'lid', gewijzigd = now() where gesprek = v_gesprek and gebruiker = v_id;
    update private.chat_leden set status = v_status, gewijzigd = now()
    where gesprek = v_gesprek and gebruiker = v_ander and status = 'weg';
  end if;
  return jsonb_build_object('ok', true, 'id', v_gesprek);
end; $$;

create or replace function public.chat_groep_maken(p_naam text, p_wachtwoord text, p_groep text, p_leden text[])
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_gesprek bigint; v_niet text[] := '{}';
  v_lid text; v_ander bigint;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if trim(coalesce(p_groep, '')) = '' then return jsonb_build_object('fout', 'Geef de groep een naam.'); end if;
  if coalesce(array_length(p_leden, 1), 0) > 100 then return jsonb_build_object('fout', 'Hoogstens 100 mensen.'); end if;
  insert into private.chat_gesprekken (soort, naam, maker) values ('groep', left(trim(p_groep), 60), v_id)
  returning id into v_gesprek;
  insert into private.chat_leden (gesprek, gebruiker, status, beheerder) values (v_gesprek, v_id, 'lid', true);
  foreach v_lid in array coalesce(p_leden, '{}') loop
    select id into v_ander from private.gebruikers
    where naam = lower(trim(both '@ ' from v_lid)) and not verwijderd and not geblokkeerd and id <> v_id;
    if v_ander is null or private.chat_geblokkeerd(v_id, v_ander) or not private.chat_heeft_apparaat(v_ander) then
      v_niet := v_niet || v_lid;
    else
      insert into private.chat_leden (gesprek, gebruiker, status)
      values (v_gesprek, v_ander, case when private.chat_is_contact(v_ander, v_id) then 'lid' else 'verzoek' end)
      on conflict do nothing;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'id', v_gesprek, 'niet_gevonden', to_jsonb(v_niet));
end; $$;

create or replace function public.chat_lid_toevoegen(p_naam text, p_wachtwoord text, p_gesprek bigint, p_wie text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_ander bigint; v_status text;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if not exists (select 1 from private.chat_leden l join private.chat_gesprekken g on g.id = l.gesprek
                 where l.gesprek = p_gesprek and l.gebruiker = v_id and l.status = 'lid' and l.beheerder and g.soort = 'groep') then
    return jsonb_build_object('fout', 'Alleen een beheerder van de groep kan mensen toevoegen.');
  end if;
  select id into v_ander from private.gebruikers
  where naam = lower(trim(both '@ ' from coalesce(p_wie, ''))) and not verwijderd and not geblokkeerd;
  if v_ander is null then return jsonb_build_object('fout', 'Geen gebruiker met die naam.'); end if;
  if private.chat_geblokkeerd(v_id, v_ander) then return jsonb_build_object('fout', 'Dat kan niet.'); end if;
  if not private.chat_heeft_apparaat(v_ander) then
    return jsonb_build_object('fout', 'Deze persoon gebruikt de chat nog niet. Vraag of die de chat één keer opent.');
  end if;
  if (select count(*) from private.chat_leden where gesprek = p_gesprek and status <> 'weg') >= 100 then
    return jsonb_build_object('fout', 'Een groep heeft hoogstens 100 mensen.');
  end if;
  v_status := case when private.chat_is_contact(v_ander, v_id) then 'lid' else 'verzoek' end;
  insert into private.chat_leden (gesprek, gebruiker, status) values (p_gesprek, v_ander, v_status)
  on conflict (gesprek, gebruiker) do update set status = case when private.chat_leden.status = 'lid' then 'lid' else v_status end,
    gewijzigd = now();
  return jsonb_build_object('ok', true);
end; $$;

create or replace function public.chat_antwoorden(p_naam text, p_wachtwoord text, p_gesprek bigint, p_antwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  update private.chat_leden set status = case when p_antwoord = 'ja' then 'lid' else 'weg' end, gewijzigd = now(),
    beheerder = beheerder and p_antwoord = 'ja'
  where gesprek = p_gesprek and gebruiker = v_id and p_antwoord in ('ja', 'nee', 'verlaten')
    and case p_antwoord when 'verlaten' then status = 'lid' else status = 'verzoek' end;
  if not found then return jsonb_build_object('fout', 'Dit kan niet (meer).'); end if;
  if p_antwoord = 'ja' then
    perform private.chat_contact_zetten(v_id, l.gebruiker)
    from private.chat_leden l join private.chat_gesprekken g on g.id = l.gesprek
    where l.gesprek = p_gesprek and g.soort = 'twee' and l.gebruiker <> v_id;
  end if;
  if p_antwoord = 'verlaten' and not exists (select 1 from private.chat_leden where gesprek = p_gesprek and status = 'lid' and beheerder) then
    update private.chat_leden set beheerder = true
    where gesprek = p_gesprek and gebruiker = (select gebruiker from private.chat_leden where gesprek = p_gesprek
                                               and status = 'lid' order by gewijzigd limit 1);
  end if;
  return jsonb_build_object('ok', true);
end; $$;

create or replace function public.chat_blokkeren(p_naam text, p_wachtwoord text, p_wie bigint, p_aan boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if p_wie = v_id then return jsonb_build_object('fout', 'Dat ben je zelf.'); end if;
  insert into private.chat_blokkades (gebruiker, geblokkeerd, weg) values (v_id, p_wie, not p_aan)
  on conflict (gebruiker, geblokkeerd) do update set weg = not p_aan, aangemaakt = now();
  if p_aan then
    update private.chat_contacten set weg = true where gebruiker = v_id and contact = p_wie;
    update private.chat_leden l set status = 'weg', gewijzigd = now()
    from private.chat_gesprekken g
    where g.id = l.gesprek and g.soort = 'twee' and l.gebruiker = v_id and l.status <> 'weg'
      and exists (select 1 from private.chat_leden x where x.gesprek = g.id and x.gebruiker = p_wie);
  end if;
  return jsonb_build_object('ok', true);
end; $$;

revoke all on function private.chat_is_contact(bigint, bigint) from public, anon, authenticated;
revoke all on function private.chat_contact_zetten(bigint, bigint) from public, anon, authenticated;
