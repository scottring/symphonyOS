-- 101_guard_goal_conversion.test.sql
-- Proof for supabase/migrations/2026-09-27_guard_goal_conversion.sql: no goal
-- link (supports_goal_task_id, goal_task_id) is left pointing at a row that
-- is not a goal. Runs as postgres and ends in ROLLBACK, so the database keeps
-- zero rows. Races and hidden (RLS) rows are proven separately by
-- guard_goal_conversion.concurrency.mjs, which needs two real connections.
begin;
do $$
declare
  u uuid := gen_random_uuid();
  season uuid := gen_random_uuid(); month_goal uuid := gen_random_uuid();
  plain uuid := gen_random_uuid(); step uuid := gen_random_uuid(); free uuid := gen_random_uuid();
  caught bool;
  before text; after text;
begin
  insert into auth.users (id, email, aud, role) values (u, '101-guard@example.invalid', 'authenticated', 'authenticated');
  insert into public.tasks (id, user_id, title, bucket, is_goal, season_start) values
    (season, u, '101 season goal', 'quarter', true, date '2026-09-01'),
    (free,   u, '101 free goal',   'quarter', true, date '2026-09-01'),
    (plain,  u, '101 plain task',  'quarter', false, date '2026-09-01');
  insert into public.tasks (id, user_id, title, bucket, is_goal, month_start, supports_goal_task_id)
    values (month_goal, u, '101 month goal', 'month', true, date '2026-10-01', season);
  insert into public.tasks (id, user_id, title, bucket, is_goal, season_start, goal_task_id)
    values (step, u, '101 step', 'quarter', false, date '2026-09-01', free);

  select md5(string_agg(row(id, is_goal, goal_task_id, supports_goal_task_id)::text, ',' order by id)) into before from public.tasks where user_id = u;

  -- 1. A goal that another goal supports cannot become a task.
  caught := false; begin update public.tasks set is_goal = false where id = season; exception when check_violation then caught := true; end;
  assert caught, '1: a supported goal became a task';
  -- 2. A goal carrying its own link up cannot become a task.
  caught := false; begin update public.tasks set is_goal = false where id = month_goal; exception when check_violation then caught := true; end;
  assert caught, '2: a linked month goal became a task';
  -- 3. A goal with a next action under it cannot become a task.
  caught := false; begin update public.tasks set is_goal = false where id = free; exception when check_violation then caught := true; end;
  assert caught, '3: a goal with a next action became a task';
  -- 4. A next action can only be filed under a goal.
  caught := false; begin update public.tasks set goal_task_id = plain where id = step; exception when check_violation then caught := true; end;
  assert caught, '4: a next action was filed under a task';
  caught := false; begin insert into public.tasks (user_id, title, bucket, goal_task_id) values (u, '101 bad step', 'quarter', plain); exception when check_violation then caught := true; end;
  assert caught, '4b: a next action was inserted under a task';
  -- Refusals changed nothing.
  select md5(string_agg(row(id, is_goal, goal_task_id, supports_goal_task_id)::text, ',' order by id)) into after from public.tasks where user_id = u;
  assert before = after, 'a refusal changed data';

  -- 5. Ordinary work still passes: completion, unlinking, then conversion.
  update public.tasks set completed = true where id = step;
  update public.tasks set completed = true where id = free;
  update public.tasks set completed = false where id = free;
  update public.tasks set goal_task_id = null where id = step;
  update public.tasks set is_goal = false where id = free;
  update public.tasks set is_goal = true where id = free;
  update public.tasks set goal_task_id = free where id = step;
  update public.tasks set supports_goal_task_id = null where id = month_goal;
  update public.tasks set is_goal = false where id = month_goal;
  update public.tasks set is_goal = false where id = season;
  -- 6. Deleting a goal still clears its links (the foreign keys' SET NULL).
  delete from public.tasks where id = free;
  assert (select goal_task_id from public.tasks where id = step) is null, '6: delete did not clear the link';
  raise notice 'guard goal conversion: all assertions passed';
end $$;
rollback;
