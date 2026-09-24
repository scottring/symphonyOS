-- 095_goal_supports_goal.test.sql
-- Proof for supabase/migrations/2026-09-24_goal_supports_goal.sql.
--
-- Runs as postgres (Management API, Supabase MCP execute_sql, or the local
-- harness in scripts/test-goal-support-locally.sh) and ends in ROLLBACK, so
-- the database keeps zero rows either way. A failed assertion raises; a clean
-- run ends with one NOTICE.
--
-- Accounts: two members of the same household, and one user in a DIFFERENT
-- household. Same ids the local harness seeds, so the file is identical on
-- both databases.
--
-- Before the migration every assertion that expects a rejection fails — the
-- column does not exist, so the whole block errors on the first insert. That
-- is the proof it is the migration doing the work.

begin;

do $$
declare
  alex     constant uuid := 'f9ff9f28-ea44-4763-9454-9eb4e4ea2ef7';
  partner  constant uuid := '3431facd-dc33-41a1-b42d-f1a375eec505';  -- same household as Alex
  outsider constant uuid := '4b8f6412-d067-449e-9c5e-2d31c22f8822';  -- a DIFFERENT household
  season_goal   uuid := gen_random_uuid();
  month_goal    uuid := gen_random_uuid();
  other_season  uuid := gen_random_uuid();   -- the outsider's season goal
  plain_quarter uuid := gen_random_uuid();   -- a quarter TASK, not a goal
  step          uuid := gen_random_uuid();   -- an ordinary step under month_goal
  n int;
  caught bool;
begin
  insert into public.tasks (id, user_id, title, bucket, is_goal, season_start) values
    (season_goal,  alex,     'goal-support proof: a season of repairs', 'quarter', true,  date '2026-09-22'),
    (other_season, outsider, 'goal-support proof: outsider season',     'quarter', true,  date '2026-09-22');
  insert into public.tasks (id, user_id, title, bucket, is_goal) values
    (plain_quarter, alex, 'goal-support proof: quarter task', 'quarter', false);

  -- 1. The happy path: a month goal records the season goal it supports.
  insert into public.tasks (id, user_id, title, bucket, is_goal, month_start, supports_goal_task_id)
    values (month_goal, alex, 'goal-support proof: a home easier to care for', 'month', true, date '2026-10-01', season_goal);
  select count(*) into n from public.tasks where id = month_goal and supports_goal_task_id = season_goal;
  assert n = 1, '1. a month goal must be able to support a season goal';

  -- 2. A household member may support the same goal. Sharing is a household
  --    question, exactly as every other predicate on tasks judges it.
  begin
    insert into public.tasks (id, user_id, title, bucket, is_goal, month_start, supports_goal_task_id)
      values (gen_random_uuid(), partner, 'goal-support proof: partner month goal', 'month', true, date '2026-10-01', season_goal);
    caught := false;
  exception when others then caught := true;
  end;
  assert not caught, '2. a household member must be able to support the same season goal';

  -- 3. Self-link.
  begin
    update public.tasks set supports_goal_task_id = month_goal where id = month_goal;
    caught := false;
  exception when others then caught := true;
  end;
  assert caught, '3. a goal must not be able to support itself';

  -- 4. A task is not a goal: only a goal supports a goal.
  begin
    insert into public.tasks (id, user_id, title, bucket, is_goal, month_start, supports_goal_task_id)
      values (step, alex, 'goal-support proof: ordinary task', 'month', false, date '2026-10-01', season_goal);
    caught := false;
  exception when others then caught := true;
  end;
  assert caught, '4. an ordinary task must not carry a support link (goal_task_id is where a step belongs)';

  -- 5. Wrong rung, child side: a SEASON goal records its year goal on
  --    goal_id, never here.
  begin
    update public.tasks set supports_goal_task_id = other_season where id = season_goal;
    caught := false;
  exception when others then caught := true;
  end;
  assert caught, '5. only a month goal may carry a support link';

  -- 6. Wrong rung, parent side: the supported row must be a SEASON goal.
  begin
    update public.tasks set supports_goal_task_id = plain_quarter where id = month_goal;
    caught := false;
  exception when others then caught := true;
  end;
  assert caught, '6. the supported row must be an is_goal row';

  -- 7. Across households.
  begin
    update public.tasks set supports_goal_task_id = other_season where id = month_goal;
    caught := false;
  exception when others then caught := true;
  end;
  assert caught, '7. a goal must not support a goal in another household';

  -- 8. Every rejection left the original link intact.
  select count(*) into n from public.tasks where id = month_goal and supports_goal_task_id = season_goal;
  assert n = 1, '8. a rejected write must not disturb the link already recorded';

  -- 9. A missing parent.
  begin
    update public.tasks set supports_goal_task_id = gen_random_uuid() where id = month_goal;
    caught := false;
  exception when others then caught := true;
  end;
  assert caught, '9. the supported goal must exist';

  -- 10. Carry-forward independence, at the database. Moving a task rewrites
  --     bucket and the period stamps; the goal it supports is untouched, and
  --     nothing points DOWN, so no parent can be dragged by a child's move.
  insert into public.tasks (id, user_id, title, bucket, is_goal, month_start, goal_task_id)
    values (step, alex, 'goal-support proof: a step', 'month', false, date '2026-10-01', month_goal);
  update public.tasks set bucket = 'week', month_start = null, week_start = date '2026-10-05' where id = step;
  select count(*) into n from public.tasks
    where id = month_goal and bucket = 'month' and month_start = date '2026-10-01' and supports_goal_task_id = season_goal;
  assert n = 1, '10. carrying a step must leave its goal, and that goal''s support link, exactly as they were';
  select count(*) into n from public.tasks where id = season_goal and bucket = 'quarter' and season_start = date '2026-09-22';
  assert n = 1, '11. carrying a step must not move the season goal above it';

  -- 12. Unlinking is always allowed; so is an unrelated write to a linked row.
  update public.tasks set title = title || ' (renamed)' where id = month_goal;
  update public.tasks set supports_goal_task_id = null where id = month_goal;
  select count(*) into n from public.tasks where id = month_goal and supports_goal_task_id is null;
  assert n = 1, '12. a link must be clearable';

  raise notice 'goal supports goal: all 12 assertions passed';
end $$;

rollback;
