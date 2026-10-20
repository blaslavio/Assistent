-- Je agenda zien in Apple Agenda, Google Agenda of Outlook (abonneren op een geheime link, alleen lezen).
-- De edge function `agenda` maakt er een .ics van. Een nieuwe link maken zet de oude meteen uit.

create table if not exists private.agenda_feeds (
  gebruiker_id bigint primary key references private.gebruikers(id),
  token_hash text unique,
  details boolean not null default true,
  aangemaakt timestamptz not null default now(),
  opgehaald timestamptz
);
alter table private.agenda_feeds enable row level security;

create or replace function public.agenda_feed_maken(p_naam text, p_wachtwoord text, p_details boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  insert into private.agenda_feeds (gebruiker_id, token_hash, details)
  values (v_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), coalesce(p_details, true))
  on conflict (gebruiker_id) do update set token_hash = excluded.token_hash, details = excluded.details,
    aangemaakt = now(), opgehaald = null;
  return jsonb_build_object('ok', true, 'token', v_token);
end; $$;

create or replace function public.agenda_feed_status(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); f private.agenda_feeds;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into f from private.agenda_feeds where gebruiker_id = v_id;
  return jsonb_build_object('aan', f.token_hash is not null, 'details', coalesce(f.details, true),
                            'aangemaakt', f.aangemaakt, 'opgehaald', f.opgehaald);
end; $$;

create or replace function public.agenda_feed_uit(p_naam text, p_wachtwoord text)
returns boolean language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return false; end if;
  update private.agenda_feeds set token_hash = null where gebruiker_id = v_id;
  return true;
end; $$;

-- Alleen voor de edge function (service role): de afspraken van 60 dagen terug tot een jaar vooruit.
create or replace function public.agenda_feed(p_token text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare f private.agenda_feeds;
begin
  update private.agenda_feeds set opgehaald = now()
  where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and gebruiker_id in (select id from private.gebruikers where not verwijderd and not geblokkeerd)
  returning * into f;
  if f.gebruiker_id is null then return null; end if;
  return jsonb_build_object('details', f.details, 'afspraken', coalesce((
    select jsonb_agg(jsonb_build_object('id', a ->> 'id', 'start', a ->> 'start', 'einde', a ->> 'einde',
             'titel', case when f.details then a ->> 'titel' else 'Bezet' end,
             'locatie', case when f.details then coalesce(a ->> 'locatie', '') else '' end,
             'notitie', case when f.details then coalesce(a ->> 'notitie', '') else '' end))
    from public.gegevens g, jsonb_array_elements(coalesce(g.data -> 'afspraken', '[]'::jsonb)) a
    where g.id = f.gebruiker_id and coalesce(a ->> 'start', '') ~ '^\d{4}-\d{2}-\d{2}'
      and left(a ->> 'start', 10) between to_char(current_date - 60, 'YYYY-MM-DD')
                                      and to_char(current_date + 365, 'YYYY-MM-DD')), '[]'::jsonb));
end; $$;

revoke all on function public.agenda_feed(text) from public, anon, authenticated;
grant execute on function public.agenda_feed(text) to service_role;
