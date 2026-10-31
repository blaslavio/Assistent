-- Private and business workspaces. No existing records are reassigned.
create table if not exists public.os_workspaces (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check (kind in ('personal','business')),
 name text not null check (char_length(trim(name)) between 1 and 120),
 created_at timestamptz not null default now(),
 unique(id,owner_id)
);
create unique index if not exists os_one_personal_workspace on public.os_workspaces(owner_id) where kind='personal';
create table if not exists public.os_workspace_members (
 workspace_id uuid not null references public.os_workspaces(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check (role in ('owner','admin','member')),
 primary key(workspace_id,user_id)
);
create index if not exists os_members_user_idx on public.os_workspace_members(user_id);
alter table public.os_workspaces enable row level security;
alter table public.os_workspace_members enable row level security;
revoke all on public.os_workspaces, public.os_workspace_members from anon;
grant select,insert,update,delete on public.os_workspaces to authenticated;
grant select,insert,update,delete on public.os_workspace_members to authenticated;
create policy os_workspaces_owner_select on public.os_workspaces for select to authenticated using ((select auth.uid())=owner_id);
create policy os_workspaces_owner_insert on public.os_workspaces for insert to authenticated with check ((select auth.uid())=owner_id);
create policy os_workspaces_owner_update on public.os_workspaces for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy os_workspaces_owner_delete on public.os_workspaces for delete to authenticated using ((select auth.uid())=owner_id);
-- Membership access is intentionally owner-only at first; no recursive RLS and no implicit staff access.
create policy os_members_owner_select on public.os_workspace_members for select to authenticated
 using (exists(select 1 from public.os_workspaces w where w.id=workspace_id and w.owner_id=(select auth.uid())));
create policy os_members_owner_insert on public.os_workspace_members for insert to authenticated
 with check (exists(select 1 from public.os_workspaces w where w.id=workspace_id and w.owner_id=(select auth.uid()))
 and (role <> 'owner' or user_id=(select auth.uid())));
create policy os_members_owner_update on public.os_workspace_members for update to authenticated
 using (exists(select 1 from public.os_workspaces w where w.id=workspace_id and w.owner_id=(select auth.uid())))
 with check (exists(select 1 from public.os_workspaces w where w.id=workspace_id and w.owner_id=(select auth.uid()))
 and (role <> 'owner' or user_id=(select auth.uid())));
create policy os_members_owner_delete on public.os_workspace_members for delete to authenticated
 using (exists(select 1 from public.os_workspaces w where w.id=workspace_id and w.owner_id=(select auth.uid())))
 and role <> 'owner';
-- New scoped records are independent of legacy items until explicit migration.
create table if not exists public.os_workspace_items (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.os_workspaces(id) on delete cascade,
 created_by uuid not null references auth.users(id),
 kind text not null check(kind in ('task','event','note')),
 title text not null check(char_length(trim(title)) between 1 and 180),
 starts_at timestamptz,
 ends_at timestamptz,
 created_at timestamptz not null default now(),
 check (ends_at is null or (starts_at is not null and ends_at>starts_at))
);
create index if not exists os_items_workspace_idx on public.os_workspace_items(workspace_id,starts_at);
alter table public.os_workspace_items enable row level security;
revoke all on public.os_workspace_items from anon;
grant select,insert,update,delete on public.os_workspace_items to authenticated;
create policy os_items_owner_select on public.os_workspace_items for select to authenticated
 using(exists(select 1 from public.os_workspaces w where w.id=workspace_id and w.owner_id=(select auth.uid())));
create policy os_items_owner_insert on public.os_workspace_items for insert to authenticated
 with check(created_by=(select auth.uid()) and exists(select 1 from public.os_workspaces w where w.id=workspace_id and w.owner_id=(select auth.uid())));
create policy os_items_owner_update on public.os_workspace_items for update to authenticated
 using(exists(select 1 from public.os_workspaces w where w.id=workspace_id and w.owner_id=(select auth.uid())))
 with check(exists(select 1 from public.os_workspaces w where w.id=workspace_id and w.owner_id=(select auth.uid())));
create policy os_items_owner_delete on public.os_workspace_items for delete to authenticated
 using(exists(select 1 from public.os_workspaces w where w.id=workspace_id and w.owner_id=(select auth.uid())));
