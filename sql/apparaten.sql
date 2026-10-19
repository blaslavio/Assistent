-- Ingelogd blijven op een vertrouwd apparaat (nodig om de app vanuit Siri te openen zonder in te loggen).
--
-- Na het inloggen kan de app een apparaatsleutel in Safari bewaren. Opent de app later op dat apparaat, dan ruilt
-- ze die sleutel in voor een gewone sessie. Een sleutel vervalt na 90 dagen zonder gebruik, bij uitloggen op dat
-- apparaat, bij "overal uitloggen" en als je hem intrekt. Alleen een tabel en functies erbij; niets verwijderd.

create table if not exists private.apparaten (
  id bigint generated always as identity primary key,
  gebruiker bigint not null references private.gebruikers(id),
  token_hash text not null unique,
  naam text not null default '',
  aangemaakt timestamptz not null default now(),
  laatst timestamptz not null default now(),
  ingetrokken boolean not null default false
);
create index if not exists apparaten_gebruiker on private.apparaten (gebruiker);
alter table private.apparaten enable row level security;

create or replace function public.apparaat_onthouden(p_naam text, p_wachtwoord text, p_apparaat text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
        v_token text := 'apparaat.' || encode(extensions.gen_random_bytes(32), 'hex');
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  -- Hooguit 10 apparaten tegelijk: het oudste vervalt.
  update private.apparaten set ingetrokken = true
  where id in (select id from private.apparaten where gebruiker = v_id and not ingetrokken
               order by laatst desc offset 9);
  insert into private.apparaten (gebruiker, token_hash, naam)
  values (v_id, private.hash(v_token), left(coalesce(p_apparaat, ''), 80));
  return jsonb_build_object('token', v_token);
end; $$;

create or replace function public.apparaat_inloggen(p_token text, p_apparaat text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v private.apparaten; g private.gebruikers;
begin
  select * into v from private.apparaten
  where token_hash = private.hash(coalesce(p_token, '')) and not ingetrokken and laatst > now() - interval '90 days';
  if v.id is null then return jsonb_build_object('fout', 'onbekend'); end if;
  select * into g from private.gebruikers where id = v.gebruiker and not geblokkeerd and not verwijderd;
  if g.id is null then return jsonb_build_object('fout', 'onbekend'); end if;
  update private.apparaten set laatst = now() where id = v.id;
  insert into private.inlogs (gebruiker, apparaat, gelukt, reden) values (g.id, left(p_apparaat, 80), true, 'apparaat');
  return jsonb_build_object('token', private.nieuwe_sessie(g.id, p_apparaat), 'naam', coalesce(g.naam, ''));
end; $$;

create or replace function public.apparaat_vergeten(p_token text)
returns jsonb language sql security definer set search_path to '' as $$
  update private.apparaten set ingetrokken = true where token_hash = private.hash(coalesce(p_token, ''));
  select jsonb_build_object('ok', true)
$$;

create or replace function public.mijn_apparaten(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object('apparaten', coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 'naam', naam, 'aangemaakt', aangemaakt, 'laatst', laatst)
                     order by laatst desc)
    from private.apparaten where gebruiker = v_id and not ingetrokken and laatst > now() - interval '90 days'
  ), '[]'::jsonb));
end; $$;

create or replace function public.apparaat_intrekken(p_naam text, p_wachtwoord text, p_id bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  update private.apparaten set ingetrokken = true where gebruiker = v_id and (id = p_id or p_id is null);
  return jsonb_build_object('ok', true);
end; $$;

-- Overal uitloggen: zoals in beveiliging.sql, en nu ook alle bewaarde apparaten vergeten.
create or replace function public.overal_uitloggen(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  update private.sessies set verloopt = now()
  where gebruiker = v_id and verloopt > now() and token_hash <> private.hash(coalesce(p_wachtwoord, ''));
  update private.apparaten set ingetrokken = true where gebruiker = v_id and not ingetrokken;
  return jsonb_build_object('ok', true);
end; $$;

-- --- Rechten --------------------------------------------------------------------------------

revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function
  public.apparaat_onthouden(text, text, text), public.apparaat_inloggen(text, text), public.apparaat_vergeten(text),
  public.mijn_apparaten(text, text), public.apparaat_intrekken(text, text, bigint), public.overal_uitloggen(text, text)
  from public;
grant execute on function
  public.apparaat_onthouden(text, text, text), public.apparaat_inloggen(text, text), public.apparaat_vergeten(text),
  public.mijn_apparaten(text, text), public.apparaat_intrekken(text, text, bigint), public.overal_uitloggen(text, text)
  to anon, authenticated;
