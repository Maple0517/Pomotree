create table if not exists public.pomotree_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  schema_version integer not null check (schema_version = 1),
  snapshot jsonb not null,
  snapshot_updated_at timestamptz not null,
  client_id text not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.pomotree_snapshots enable row level security;

revoke all on public.pomotree_snapshots from anon;
grant select, insert, update, delete on public.pomotree_snapshots to authenticated;

create policy "Users can read their own Pomotree snapshot"
  on public.pomotree_snapshots
  for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "Users can insert their own Pomotree snapshot"
  on public.pomotree_snapshots
  for insert
  to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "Users can update their own Pomotree snapshot"
  on public.pomotree_snapshots
  for update
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "Users can delete their own Pomotree snapshot"
  on public.pomotree_snapshots
  for delete
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);
