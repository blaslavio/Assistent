-- Accountgebonden assistentberichten; geen gegevensdocument vervangen.
create table if not exists private.assistent_berichten (
  id bigint generated always as identity primary key,
  gebruiker_id bigint not null references private.gebruikers(id) on delete cascade,
  rol text not null check (rol in ('user', 'assistant')),
  inhoud text not null check (char_length(inhoud) between 1 and 20000),
  aangemaakt timestamptz not null default now()
);
alter table private.assistent_berichten enable row level security;
create index if not exists assistent_berichten_gebruiker_id on private.assistent_berichten (gebruiker_id, id);

create or replace function public.assistent_bericht_toevoegen(p_naam text, p_wachtwoord text, p_rol text, p_inhoud text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_gebruiker bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_id bigint;
begin
  if v_gebruiker is null then raise exception 'Geen toegang' using errcode = '42501'; end if;
  insert into private.assistent_berichten (gebruiker_id, rol, inhoud)
  values (v_gebruiker, p_rol, p_inhoud) returning id into v_id;
  return v_id;
end; $$;

create or replace function public.assistent_berichten_lezen(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_gebruiker bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_gebruiker is null then raise exception 'Geen toegang' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'rol', b.rol, 'inhoud', b.inhoud) order by b.id)
    from (select id, rol, inhoud from private.assistent_berichten where gebruiker_id = v_gebruiker order by id desc limit 100) b), '[]'::jsonb);
end; $$;
