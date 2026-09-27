-- 102_goal_link_visible.test.sql
-- Proof for "Add an existing action" (goal_task_id from the goal's end) and
-- for supabase/migrations/2026-09-27_goal_link_visible.sql. Runs as real
-- `authenticated` users with RLS on, against the LOCAL stack's fictional
-- households (alex+sam share one; quinn is in another). Ends in ROLLBACK.
-- Pass the migration first when proving it: psql -f <migration> -f <this>
-- inside one transaction is what run-102.sh does.
do $$
declare
  alex uuid := (select id from auth.users where email = 'alex@horizon.test');
  sam uuid := (select id from auth.users where email = 'sam@horizon.test');
  quinn uuid := (select id from auth.users where email = 'quinn@horizon.test');
  g_alex uuid := gen_random_uuid(); g_sam_shared uuid := gen_random_uuid(); g_sam_private uuid := gen_random_uuid(); g_quinn uuid := gen_random_uuid();
  t_alex uuid := gen_random_uuid(); t_alex_private uuid := gen_random_uuid(); t_sam_shared uuid := gen_random_uuid(); t_sam_private uuid := gen_random_uuid();
  caught text; n int; before text; after text;
begin
  -- Fixtures, as postgres.
  insert into public.tasks (id, user_id, title, bucket, is_goal, month_start, scope, context) values
    (g_alex, alex, '102 Identify family activities for fall', 'month', true, date '2026-10-01', 'compound', 'family'),
    (g_sam_shared, sam, '102 Sam shared goal', 'month', true, date '2026-10-01', 'compound', 'family'),
    (g_sam_private, sam, '102 Sam private goal', 'month', true, date '2026-10-01', 'individual', 'work'),
    (g_quinn, quinn, '102 Quinn goal', 'month', true, date '2026-10-01', 'compound', 'family');
  insert into public.tasks (id, user_id, title, bucket, scheduled_for, is_all_day, notes, scope, context, week_start) values
    (t_alex, alex, '102 Look up music lessons', 'week', null, null, 'Ask about cello', 'compound', 'family', date '2026-10-05'),
    (t_alex_private, alex, '102 Private errand', 'timed', timestamptz '2026-10-07 15:00-04', false, 'mine', 'individual', 'personal', null),
    (t_sam_shared, sam, '102 Sam shared task', 'inbox', null, null, null, 'compound', 'family', null),
    (t_sam_private, sam, '102 Sam private task', 'inbox', null, null, null, 'individual', 'work', null);

  perform set_config('request.jwt.claims', json_build_object('sub', alex, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', alex::text, true);
  set local role authenticated;

  -- 1. Own action under own goal: filed; nothing else about it changes.
  select md5(row(title, notes, bucket, scheduled_for, week_start, month_start, scope, context, completed, assigned_to, assigned_to_all, user_id)::text) into before from public.tasks where id = t_alex;
  update public.tasks set goal_task_id = g_alex where id = t_alex;
  assert (select goal_task_id from public.tasks where id = t_alex) = g_alex, '1: not filed';
  select md5(row(title, notes, bucket, scheduled_for, week_start, month_start, scope, context, completed, assigned_to, assigned_to_all, user_id)::text) into after from public.tasks where id = t_alex;
  assert before = after, '1: filing changed the task';

  -- 2. A scheduled private action under a shared goal: allowed, stays private and scheduled.
  update public.tasks set goal_task_id = g_alex where id = t_alex_private;
  assert (select scope from public.tasks where id = t_alex_private) = 'individual', '2: privacy changed';
  assert (select scheduled_for from public.tasks where id = t_alex_private) = timestamptz '2026-10-07 15:00-04', '2: date changed';

  -- 3. Under a household member's SHARED goal: allowed.
  update public.tasks set goal_task_id = g_sam_shared where id = t_alex;
  assert (select goal_task_id from public.tasks where id = t_alex) = g_sam_shared, '3: shared goal refused';

  -- 4. Under a household member's PRIVATE goal: refused (the migration).
  caught := null;
  begin update public.tasks set goal_task_id = g_sam_private where id = t_alex; exception when others then caught := sqlstate; end;
  assert caught = '42501', format('4: private goal accepted (%s)', coalesce(caught, 'no error'));

  -- 5. Under another household's goal: refused (the migration).
  caught := null;
  begin update public.tasks set goal_task_id = g_quinn where id = t_alex; exception when others then caught := sqlstate; end;
  assert caught = '42501', format('5: other household goal accepted (%s)', coalesce(caught, 'no error'));

  -- 6. A household member's SHARED task: RLS lets alex file it.
  update public.tasks set goal_task_id = g_alex where id = t_sam_shared;
  get diagnostics n = row_count;
  assert n = 1, '6: shared task not filed';

  -- 7. A household member's PRIVATE task: RLS hides it — nothing is written.
  update public.tasks set goal_task_id = g_alex where id = t_sam_private;
  get diagnostics n = row_count;
  assert n = 0, '7: private task of another member was filed';

  -- 8. Unlink: the link goes, the task stays, dated and committed.
  update public.tasks set goal_task_id = null where id = t_alex_private;
  assert (select goal_task_id is null and scheduled_for is not null from public.tasks where id = t_alex_private), '8: unlink lost the task or its date';

  -- 9. Sam (sharing the goal) cannot see alex's private action even while it is filed under alex's shared goal.
  reset role;
  update public.tasks set goal_task_id = g_alex where id = t_alex_private;
  perform set_config('request.jwt.claims', json_build_object('sub', sam, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', sam::text, true);
  set local role authenticated;
  assert (select count(*) from public.tasks where goal_task_id = g_alex) = 1, '9: sam sees the wrong steps (want only the shared one)';
  assert not exists (select 1 from public.tasks where id = t_alex_private), '9: private action exposed through a shared goal';
  reset role;
  raise notice '102 goal link visible: all assertions passed';
end $$;
