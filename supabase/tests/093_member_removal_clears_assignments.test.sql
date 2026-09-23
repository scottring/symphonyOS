-- 093_member_removal_clears_assignments.test.sql
-- Live two-account proof for
-- supabase/migrations/2026-09-23_member_removal_clears_assignments.sql.
--
-- Runs as postgres (Management API or the Supabase MCP execute_sql), switches
-- to the `authenticated` role with a real user's JWT claims so auth.uid() and
-- RLS genuinely apply, and ends in ROLLBACK so production keeps zero rows.
-- A failed assertion raises; a clean run ends with one NOTICE.
--
-- Accounts: the test household (owner Alex, plus a second member account).
-- Before the migration, assertion 2 fails with a foreign-key error (a private
-- task the remover cannot see still has the member as assignee) — that is the
-- proof of the gap. After it, every assertion passes.

begin;

do $$
declare
  alex    constant uuid := 'f9ff9f28-ea44-4763-9454-9eb4e4ea2ef7';
  other   constant uuid := '3431facd-dc33-41a1-b42d-f1a375eec505';
  keeper  constant uuid := '2d836535-d9cc-498e-9c2f-2ee3a96e8443';  -- Alex's own member; must survive in lists
  p       uuid := gen_random_uuid();   -- member removed successfully
  q       uuid := gen_random_uuid();   -- member whose removal must fail
  t_shared  uuid := gen_random_uuid(); -- other's task, couple scope
  t_list    uuid := gen_random_uuid(); -- other's PRIVATE task listing p
  t_single  uuid := gen_random_uuid(); -- other's PRIVATE task assigned to p
  t_own     uuid := gen_random_uuid(); -- Alex's task
  t_q       uuid := gen_random_uuid(); -- other's PRIVATE task assigned to q
  r1 uuid := gen_random_uuid();
  e1 uuid := gen_random_uuid();
  i1 uuid := gen_random_uuid();
  n int;
  caught bool;
  changed int;
begin
  insert into public.family_members (id, user_id, name, initials, color) values
    (p, alex, 'removal proof P', 'RP', 'blue'),
    (q, alex, 'removal proof Q', 'RQ', 'blue');
  insert into public.tasks (id, user_id, title, notes, scope, bucket, assigned_to, assigned_to_all) values
    (t_shared, other, 'removal proof: shared',  'n', 'couple',     'week',  p,    array[p, keeper]),
    (t_list,   other, 'removal proof: private list', 'n', 'individual', 'inbox', null, array[p, keeper]),
    (t_single, other, 'removal proof: private single', 'n', 'individual', 'inbox', p, null),
    (t_own,    alex,  'removal proof: own', 'n', 'individual', 'inbox', p, array[p]),
    (t_q,      other, 'removal proof: private Q', 'n', 'individual', 'inbox', q, array[q]);
  insert into public.routines (id, user_id, name, assigned_to, assigned_to_all) values (r1, other, 'removal proof routine', p, array[p, keeper]);
  insert into public.event_notes (id, user_id, google_event_id, assigned_to, assigned_to_all) values (e1, other, 'removal-proof', p, array[p]);
  insert into public.actionable_instances (id, user_id, entity_type, entity_id, date, assigned_to_override) values (i1, other, 'routine', 'removal-proof', current_date, p);
  -- Member-owned history the cleanup deliberately leaves: q's removal must fail.
  insert into public.screen_time_budgets (user_id, family_member_id) values (alex, q);

  create temp table snap on commit drop as
    select id, title, notes, user_id, scope, bucket, updated_at from public.tasks
    where id in (t_shared, t_list, t_single, t_own);

  -- As Alex, through RLS.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', alex, 'role', 'authenticated')::text, true);

  select count(*) into n from public.tasks where id in (t_list, t_single);
  assert n = 0, '1. (control) the private tasks must be invisible to the remover';

  delete from public.family_members where id = p;
  get diagnostics n = row_count;
  assert n = 1, '2. REMOVED? Alex could not remove P';

  caught := false;
  begin
    delete from public.family_members where id = q;
  exception when foreign_key_violation then caught := true;
  end;
  assert caught, '3. a removal blocked by screen-time history must fail';

  execute 'set local role postgres';

  select count(*) into n from public.tasks
    where id in (t_shared, t_list, t_single, t_own) and (assigned_to = p or assigned_to_all @> array[p]);
  assert n = 0, '4. CLEARED? P is still assigned on a task (including a private one)';
  select count(*) into n from public.tasks where id in (t_shared, t_list) and assigned_to_all = array[keeper];
  assert n = 2, '5. other assignees must stay in the lists';
  select count(*) into n from public.routines where id = r1 and assigned_to is null and assigned_to_all = array[keeper];
  assert n = 1, '6. routine assignment not cleared';
  select count(*) into n from public.event_notes where id = e1 and assigned_to is null and assigned_to_all = '{}';
  assert n = 1, '7. event note assignment not cleared';
  select count(*) into n from public.actionable_instances where id = i1 and assigned_to_override is null;
  assert n = 1, '8. instance override not cleared';

  select count(*) into changed from snap s join public.tasks t using (id)
    where (t.title, t.notes, t.user_id, t.scope, t.bucket, t.updated_at) is distinct from (s.title, s.notes, s.user_id, s.scope, s.bucket, s.updated_at);
  assert changed = 0, '9. task contents, owner, scope, placement or updated_at changed';

  select count(*) into n from public.family_members where id = q;
  assert n = 1, '10. Q must still exist after its failed removal';
  select count(*) into n from public.tasks where id = t_q and assigned_to = q and assigned_to_all = array[q];
  assert n = 1, '11. a failed removal must roll back its assignment cleanup';

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  select count(*) into n from public.tasks where id in (t_list, t_single);
  assert n = 2, '12. (control) the owner must still see their private tasks';
  execute 'set local role postgres';

  assert not has_function_privilege('authenticated', 'public.clear_member_assignments()', 'execute'),
    '13. the cleanup function must not be callable by app roles';

  raise notice 'member removal cleanup: all 13 assertions passed';
end $$;

rollback;
