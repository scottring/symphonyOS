-- 091_home_registry.test.sql
-- Static verification of migration 091 — checks that policies, constraints,
-- and indexes landed on homes/spaces/assets as designed.
--
-- Why introspection rather than a live RLS isolation test:
--   When run via the Supabase Management API the connection is service_role,
--   which bypasses RLS. There is no pgTAP / no test seed in this project,
--   so a "fake user" approach can't actually exercise auth.uid(). Real
--   household-isolation behavior is exercised by the TypeScript hook tests
--   (Tasks 3-5) and by E2E (Task 20), both of which run with a real auth
--   session.
--
-- Run via Management API; assertion failures raise exceptions.

do $$
declare
  policy_count int;
  expected_policy_count int := 4;  -- select/insert/update/delete per table
  zone_check_exists bool;
  notes_fk_exists bool;
begin
  -- homes: 4 policies
  select count(*) into policy_count from pg_policies
    where schemaname = 'public' and tablename = 'homes';
  if policy_count <> expected_policy_count then
    raise exception 'homes: expected % policies, found %', expected_policy_count, policy_count;
  end if;

  -- spaces: 4 policies
  select count(*) into policy_count from pg_policies
    where schemaname = 'public' and tablename = 'spaces';
  if policy_count <> expected_policy_count then
    raise exception 'spaces: expected % policies, found %', expected_policy_count, policy_count;
  end if;

  -- assets: 4 policies
  select count(*) into policy_count from pg_policies
    where schemaname = 'public' and tablename = 'assets';
  if policy_count <> expected_policy_count then
    raise exception 'assets: expected % policies, found %', expected_policy_count, policy_count;
  end if;

  -- spaces zone_parent_consistency check exists
  select exists (
    select 1 from pg_constraint
    where conname = 'zone_parent_consistency' and conrelid = 'public.spaces'::regclass
  ) into zone_check_exists;
  if not zone_check_exists then
    raise exception 'spaces.zone_parent_consistency check constraint missing';
  end if;

  -- assets.notes_id FK to notes(id) exists
  select exists (
    select 1 from pg_constraint
    where conrelid = 'public.assets'::regclass
      and contype = 'f'
      and conname like '%notes%'
  ) into notes_fk_exists;
  if not notes_fk_exists then
    raise exception 'assets.notes_id FK to notes is missing';
  end if;

  -- Indexes
  if not exists (select 1 from pg_indexes where indexname = 'homes_user_idx') then
    raise exception 'index homes_user_idx missing';
  end if;
  if not exists (select 1 from pg_indexes where indexname = 'spaces_home_idx') then
    raise exception 'index spaces_home_idx missing';
  end if;
  if not exists (select 1 from pg_indexes where indexname = 'spaces_parent_idx') then
    raise exception 'index spaces_parent_idx missing';
  end if;
  if not exists (select 1 from pg_indexes where indexname = 'assets_home_idx') then
    raise exception 'index assets_home_idx missing';
  end if;
  if not exists (select 1 from pg_indexes where indexname = 'assets_space_idx') then
    raise exception 'index assets_space_idx missing';
  end if;
  if not exists (select 1 from pg_indexes where indexname = 'assets_needs_details_idx') then
    raise exception 'index assets_needs_details_idx missing';
  end if;
  if not exists (select 1 from pg_indexes where indexname = 'assets_warranty_idx') then
    raise exception 'index assets_warranty_idx missing';
  end if;

  raise notice 'OK — migration 091 produced expected policies, constraints, and indexes';
end $$;
