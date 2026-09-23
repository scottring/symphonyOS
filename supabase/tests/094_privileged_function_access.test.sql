-- 094_privileged_function_access.test.sql
-- Live proof for supabase/migrations/2026-09-23_privileged_function_access.sql.
--
-- Runs as postgres (Management API or the Supabase MCP execute_sql), switches
-- to anon / authenticated / service_role with real users' JWT claims, and
-- ends in ROLLBACK so production keeps zero rows. A failed assertion raises;
-- a clean run ends with one NOTICE.
--
-- Accounts: the test household owner Alex and its second member; Scott's
-- household as "another household". Before the migration, assertions 1, 2,
-- 4–6 and 8 fail — that is the proof of the gap.

begin;

do $$
declare
  alex  constant uuid := 'f9ff9f28-ea44-4763-9454-9eb4e4ea2ef7';
  other constant uuid := '3431facd-dc33-41a1-b42d-f1a375eec505';
  scott constant uuid := 'bace953e-87ea-4a59-b7d7-f476fa0e8c94';
  alex_hh uuid;
  scott_hh uuid;
  v text;
  j jsonb;
  n int;
  denied bool;
begin
  select household_id into alex_hh from public.household_members where user_id = alex and status = 'active' limit 1;
  select household_id into scott_hh from public.household_members where user_id = scott and status = 'active' limit 1;

  -- Signed out.
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  denied := false; begin perform public.get_household_context(alex); exception when insufficient_privilege then denied := true; end;
  assert denied, '1. anon must not read household context (health data)';
  denied := false; begin perform public.claim_engine_run('security-probe', 1); exception when insufficient_privilege then denied := true; end;
  assert denied, '4. anon must not claim engine runs';
  denied := false; begin perform public.cos_ingest_all(); exception when insufficient_privilege then denied := true; end;
  assert denied, '5. anon must not trigger proposal ingestion';
  denied := false; begin perform public.tasks_sync_from_commitments(gen_random_uuid()); exception when insufficient_privilege then denied := true; end;
  assert denied, '6. anon must not rewrite task placement caches';
  denied := false; begin perform public.ensure_inbound_token(alex_hh); exception when insufficient_privilege then denied := true; end;
  assert denied, '10. anon must not mint inbound tokens';
  assert public.signup_allowed('symphonygoals@gmail.com'), '13. sign-up gate must stay callable before sign-in';
  execute 'set local role postgres';

  -- Signed in, another household.
  perform set_config('request.jwt.claims', json_build_object('sub', scott, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  denied := false; begin perform public.get_household_context(alex); exception when insufficient_privilege then denied := true; end;
  assert denied, '2. another household must not read household context';
  denied := false; begin perform public.ensure_inbound_token(alex_hh); exception when raise_exception then denied := true; end;
  assert denied, '9. a non-member must not mint a household''s inbound token';
  execute 'set local role postgres';

  -- Service role (agent / engine) keeps access.
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  execute 'set local role service_role';
  j := public.get_household_context(alex);
  assert jsonb_array_length(j->'members') > 0, '3. service role must still read household context';
  execute 'set local role postgres';

  -- Cron (owner) keeps access.
  assert public.claim_engine_run('security-probe', 1), '7. cron/owner must still claim engine runs';

  -- Signed in as Alex: School mail and med-log tokens now work.
  perform set_config('request.jwt.claims', json_build_object('sub', alex, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v := public.ensure_inbound_token(alex_hh);
  assert v ~ '^[0-9a-f]{16}$', '8. School mail: a member must get a forwarding token (gen_random_bytes)';
  v := public.ensure_med_log_token();
  assert v ~ '^[0-9a-f]{48}$', '11. med-log token must be created';
  -- (control) RLS helpers still work for signed-in users.
  select count(*) into n from public.family_members where user_id = alex;
  assert n > 0, '12a. (control) RLS must still show Alex their own members';
  assert public.users_share_household(alex, other), '12b. (control) household check must still work';
  execute 'set local role postgres';

  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.prosecdef and p.proconfig is null;
  assert n = 0, '14. every SECURITY DEFINER function in public must pin its search_path';

  raise notice 'privileged function access: all assertions passed';
end $$;

rollback;
