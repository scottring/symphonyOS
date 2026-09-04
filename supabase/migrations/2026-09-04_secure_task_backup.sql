-- Securing a backup table created during the 2026-09-04 school-duplicate
-- cleanup. `create table ... as select` does NOT enable row security, and
-- Supabase's default privileges in `public` grant anon and authenticated — so
-- a table holding full task rows (titles, notes, assignees) was readable by
-- any signed-in user from the moment it was created.
--
-- The lesson, for any future ops table: a table made outside a migration still
-- needs RLS decided on purpose. Copying rows out of an RLS-protected table
-- does not copy its protection.
--
-- RLS on with NO policies means nothing reaches it through PostgREST at all.
-- The service role bypasses RLS, so a restore is still possible. FORCE applies
-- it to the table owner too, and the grants are revoked so this does not rest
-- on RLS alone.
alter table if exists public.deleted_task_backup_20260904 enable row level security;
alter table if exists public.deleted_task_backup_20260904 force row level security;
revoke all on public.deleted_task_backup_20260904 from anon, authenticated;

comment on table public.deleted_task_backup_20260904 is
  'Full rows of the two duplicate school tasks deleted 2026-09-04. No policies: service-role only, for restore.';
