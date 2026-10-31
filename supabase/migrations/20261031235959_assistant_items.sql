-- Phase 3: isolated assistant-created tasks and calendar entries.
-- This migration must be reviewed and applied before enabling ASSISTANT_ACTIONS_ENABLED.
create table if not exists public.assistant_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('tasks.create','agenda.create')),
  title text not null check (char_length(title) between 1 and 180),
  starts_at timestamptz,
  ends_at timestamptz,
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 128),
  created_at timestamptz not null default now(),
  unique (owner_id, idempotency_key),
  check ((kind = 'tasks.create' and starts_at is null and ends_at is null)
      or (kind = 'agenda.create' and starts_at is not null and ends_at > starts_at))
);
alter table public.assistant_items enable row level security;
revoke all on public.assistant_items from anon;
grant select on public.assistant_items to authenticated;
drop policy if exists assistant_items_owner_read on public.assistant_items;
create policy assistant_items_owner_read on public.assistant_items
for select to authenticated using ((select auth.uid()) = owner_id);

create or replace function public.assistant_create_item(
  p_action text, p_title text, p_idempotency_key text,
  p_starts_at timestamptz default null, p_ends_at timestamptz default null
) returns uuid language plpgsql security invoker set search_path = ''
as $$
declare v_owner uuid := auth.uid(); v_id uuid;
begin
  if v_owner is null then raise exception 'authentication_required'; end if;
  if p_action not in ('tasks.create','agenda.create') or
     p_title is null or char_length(trim(p_title)) not between 1 and 180 or
     p_idempotency_key !~ '^[A-Za-z0-9_-]{16,128}$' then
    raise exception 'invalid_action';
  end if;
  if (p_action = 'tasks.create' and (p_starts_at is not null or p_ends_at is not null))
     or (p_action = 'agenda.create' and (p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at)) then
    raise exception 'invalid_schedule';
  end if;
  insert into public.assistant_items(owner_id,kind,title,starts_at,ends_at,idempotency_key)
  values (v_owner,p_action,trim(p_title),p_starts_at,p_ends_at,p_idempotency_key)
  on conflict (owner_id,idempotency_key) do update
    set idempotency_key = excluded.idempotency_key
    returning id into v_id;
  if not exists (select 1 from public.assistant_items
    where id = v_id and owner_id = v_owner and kind = p_action
      and title = trim(p_title) and starts_at is not distinct from p_starts_at
      and ends_at is not distinct from p_ends_at) then
    raise exception 'idempotency_conflict';
  end if;
  return v_id;
end;
$$;
revoke all on function public.assistant_create_item(text,text,text,timestamptz,timestamptz) from public, anon;
grant execute on function public.assistant_create_item(text,text,text,timestamptz,timestamptz) to authenticated;
-- The invoker needs INSERT permissions and RLS scoped to auth.uid().
grant insert, update on public.assistant_items to authenticated;
drop policy if exists assistant_items_owner_update on public.assistant_items;
create policy assistant_items_owner_update on public.assistant_items
for update to authenticated using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);
drop policy if exists assistant_items_owner_insert on public.assistant_items;
create policy assistant_items_owner_insert on public.assistant_items
for insert to authenticated with check ((select auth.uid()) = owner_id);
