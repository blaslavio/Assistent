-- Bliksemstart: weer inloggen met de sleutel van dit apparaat en je gegevens ophalen in één keer, in plaats van
-- twee keer heen en weer naar de database. Doet precies wat apparaat_inloggen en daarna mijn_gegevens doen; die twee
-- blijven bestaan (oudere versies van de app gebruiken ze).

create or replace function public.apparaat_start(p_token text, p_apparaat text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare a jsonb := public.apparaat_inloggen(p_token, p_apparaat);
begin
  if a ? 'token' then
    return a || jsonb_build_object('gegevens', public.mijn_gegevens(a ->> 'naam', a ->> 'token'));
  end if;
  return a;
end; $$;

revoke all on function public.apparaat_start(text, text) from public;
grant execute on function public.apparaat_start(text, text) to anon, authenticated;

-- Overstappen van de app op het adres van de vorige app naar de snelle app op het beginscherm (ander adres, dus daar
-- ben je nog niet ingelogd). De app vraagt met je sessie een eenmalige code die 2 minuten geldt; de web-app op je
-- beginscherm wisselt die in voor een eigen apparaatsleutel. Alleen een hash van de code staat in de database.
create table if not exists private.overstap_codes (
  id bigserial primary key,
  gebruiker bigint not null,
  code_hash text not null unique,
  verloopt timestamptz not null default now() + interval '2 minutes',
  gebruikt boolean not null default false
);
alter table private.overstap_codes enable row level security;

create or replace function public.overstap_code(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
        v_code text := 'overstap.' || encode(extensions.gen_random_bytes(24), 'hex');
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  -- Een nieuwe code maakt de vorige ongeldig, en hooguit 10 per uur.
  if (select count(*) from private.overstap_codes where gebruiker = v_id and verloopt > now() - interval '58 minutes') >= 10 then
    return jsonb_build_object('fout', 'Probeer het later opnieuw.');
  end if;
  update private.overstap_codes set gebruikt = true where gebruiker = v_id and not gebruikt;
  insert into private.overstap_codes (gebruiker, code_hash) values (v_id, private.hash(v_code));
  return jsonb_build_object('code', v_code);
end; $$;

create or replace function public.overstap_inwisselen(p_code text, p_apparaat text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint;
        v_token text := 'apparaat.' || encode(extensions.gen_random_bytes(32), 'hex');
begin
  update private.overstap_codes set gebruikt = true
  where code_hash = private.hash(coalesce(p_code, '')) and not gebruikt and verloopt > now()
  returning gebruiker into v_id;
  if v_id is null or not exists (select 1 from private.gebruikers where id = v_id and not geblokkeerd and not verwijderd) then
    return jsonb_build_object('fout', 'onbekend');
  end if;
  -- Net als apparaat_onthouden: hooguit 10 apparaten tegelijk, het oudste vervalt.
  update private.apparaten set ingetrokken = true
  where id in (select id from private.apparaten where gebruiker = v_id and not ingetrokken order by laatst desc offset 9);
  insert into private.apparaten (gebruiker, token_hash, naam) values (v_id, private.hash(v_token), left(coalesce(p_apparaat, ''), 80));
  insert into private.inlogs (gebruiker, apparaat, gelukt, reden) values (v_id, left(p_apparaat, 80), true, 'overstap');
  return jsonb_build_object('token', v_token);
end; $$;

revoke all on function public.overstap_code(text, text), public.overstap_inwisselen(text, text) from public;
grant execute on function public.overstap_code(text, text), public.overstap_inwisselen(text, text) to anon, authenticated;
