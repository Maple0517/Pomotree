alter table public.pomotree_snapshots
  drop constraint if exists pomotree_snapshots_schema_version_check;

alter table public.pomotree_snapshots
  add constraint pomotree_snapshots_schema_version_check
  check (schema_version in (1, 2));
