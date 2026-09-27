-- Rollback for 2026-09-27_goal_link_visible.sql: the guard as applied by
-- 2026-09-27_guard_goal_conversion.sql (goal check only), and the helper dropped.
create or replace function public.guard_goal_link_target()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.supports_goal_task_id is not null
     and (tg_op = 'INSERT' or new.supports_goal_task_id is distinct from old.supports_goal_task_id)
     and not public.goal_link_target_is_goal(new.supports_goal_task_id, true) then
    raise exception 'this can only support a season goal'
      using errcode = '23514';
  end if;
  if new.goal_task_id is not null
     and (tg_op = 'INSERT' or new.goal_task_id is distinct from old.goal_task_id)
     and not public.goal_link_target_is_goal(new.goal_task_id, false) then
    raise exception 'a next action can only be filed under a goal'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
drop function if exists public.task_visible_to_invoker(uuid);
