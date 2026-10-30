-- Na webshop.sql. Contactopties staan los van opmaak, zodat opnieuw ontwerpen ze niet wist.
begin;
create table if not exists private.winkel_contact (
  gebruiker bigint primary key references private.winkels(gebruiker_id) on delete cascade,
  contact jsonb not null default '{}'::jsonb
);
alter table private.winkel_contact enable row level security;
revoke all on private.winkel_contact from public,anon,authenticated;
create or replace function public.mijn_winkel_contact(p_naam text,p_wachtwoord text)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam,p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang',true); end if;
  return jsonb_build_object('contact',coalesce((select contact from private.winkel_contact where gebruiker=v_id),'{}'::jsonb));
end; $$;
create or replace function public.winkel_contact_bewaren(p_naam text,p_wachtwoord text,p_contact jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam,p_wachtwoord); c jsonb := p_contact; b text; schoon jsonb; manieren jsonb := '[]'::jsonb;
begin
  if v_id is null then return jsonb_build_object('geen_toegang',true); end if;
  if not exists(select 1 from private.winkels where gebruiker_id=v_id) then return jsonb_build_object('fout','Maak eerst je winkel.'); end if;
  if jsonb_typeof(c) is distinct from 'object' or length(c::text)>3000 then return jsonb_build_object('fout','Controleer de contactgegevens.'); end if;
  if jsonb_typeof(c->'chat') is distinct from 'boolean' then return jsonb_build_object('fout','Kies of chat beschikbaar is.'); end if;
  if coalesce(c->>'email','')<>'' and (length(c->>'email')>254 or c->>'email' !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$') then return jsonb_build_object('fout','Controleer het mailadres.'); end if;
  foreach b in array array['telefoon','whatsapp'] loop
    if coalesce(c->>b,'')<>'' and c->>b !~ '^\+?[0-9 ()-]{6,25}$' then return jsonb_build_object('fout','Controleer het telefoonnummer.'); end if;
  end loop;
  if coalesce(c->>'whatsapp','')<>'' and c->>'whatsapp' !~ '^\+?[1-9][0-9]{6,14}$' then return jsonb_build_object('fout','Controleer de WhatsApp-landcode.'); end if;
  if coalesce(c->>'website','')<>'' and (length(c->>'website')>300 or c->>'website' !~ '^https://[^[:space:]<>"@]+$') then return jsonb_build_object('fout','Gebruik een veilig https-adres.'); end if;
  if jsonb_typeof(c->'betaalwijzen') is distinct from 'array' or jsonb_array_length(c->'betaalwijzen')>3 then return jsonb_build_object('fout','Controleer de betaalafspraken.'); end if;
  for b in select jsonb_array_elements_text(c->'betaalwijzen') loop
    if b not in ('contant','overmaken','tikkie') then return jsonb_build_object('fout','Onbekende betaalafspraak.'); end if;
    if not manieren @> jsonb_build_array(b) then manieren := manieren || jsonb_build_array(b); end if;
  end loop;
  if jsonb_array_length(manieren)>0 and c->>'chat'='false' and coalesce(c->>'email','')='' and coalesce(c->>'telefoon','')='' and coalesce(c->>'whatsapp','')='' and coalesce(c->>'website','')='' then
    return jsonb_build_object('fout','Kies een contactmethode voor betaalafspraken.');
  end if;
  schoon := jsonb_build_object('chat',c->>'chat'='true','email',coalesce(c->>'email',''),'telefoon',coalesce(c->>'telefoon',''),
    'whatsapp',coalesce(c->>'whatsapp',''),'website',coalesce(c->>'website',''),'betaalwijzen',manieren);
  insert into private.winkel_contact(gebruiker,contact) values(v_id,schoon) on conflict(gebruiker) do update set contact=excluded.contact;
  return jsonb_build_object('ok',true);
end; $$;
create or replace function public.winkel_contact_bekijken(p_adres text)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('contact',coalesce(c.contact,'{"chat":true,"betaalwijzen":[]}'::jsonb),
    'gebruiker',case when coalesce((c.contact->>'chat')::boolean,true) then g.naam else null end)
  from private.winkels w join private.gebruikers g on g.id=w.gebruiker_id left join private.winkel_contact c on c.gebruiker=w.gebruiker_id
  where w.adres=lower(trim(p_adres)) and w.open and not g.geblokkeerd and not g.verwijderd
$$;
revoke all on function public.mijn_winkel_contact(text,text),public.winkel_contact_bewaren(text,text,jsonb),public.winkel_contact_bekijken(text) from public;
grant execute on function public.mijn_winkel_contact(text,text),public.winkel_contact_bewaren(text,text,jsonb),public.winkel_contact_bekijken(text) to anon,authenticated;
create or replace function private.winkel_contact_opruimen()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.verwijderd and not coalesce(old.verwijderd,false) then delete from private.winkel_contact where gebruiker=new.id; end if;
  return new;
end; $$;
revoke all on function private.winkel_contact_opruimen() from public,anon,authenticated;
drop trigger if exists winkel_contact_verwijderen on private.gebruikers;
create trigger winkel_contact_verwijderen after update of verwijderd on private.gebruikers for each row execute function private.winkel_contact_opruimen();
notify pgrst, 'reload schema';
commit;
