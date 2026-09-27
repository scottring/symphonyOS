-- PREPARED — NOT APPLIED to the shared project. Needs review and Scott's
-- explicit approval, as its own step. Local proof:
--   supabase/tests/102_goal_link_visible.test.sql (as `authenticated`, rolled back)
-- Rollback: supabase/migrations/rollback/2026-09-27_goal_link_visible.down.sql
--
-- "Add an existing action" files a task under a goal by writing the task's
-- goal_task_id. RLS already decides who may change the TASK (its UPDATE
-- policy). Nothing decided who may point it at a GOAL: guard_goal_link_target
-- (2026-09-27_guard_goal_conversion.sql, applied) is SECURITY DEFINER and
-- checks only that the target is a goal — a signed-in user could file their
-- task under any goal id, including one in another household or one private
-- to someone else. This adds the other side: a link (goal_task_id or
-- supports_goal_task_id) may be SET only to a goal the person making the
-- change can see, by the same rule as the tasks SELECT policy. Server-side
-- writers with no auth.uid() (service role, postgres, triggers) are unchanged.
-- Clearing a link, and rows whose link does not change, are never checked.

create or replace function public.task_visible_to_invoker(p_task uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select auth.uid() is null or exists (
    select 1 from public.tasks t
    where t.id = p_task
      and (t.user_id = auth.uid()
        or (t.scope in ('couple', 'compound') and public.users_share_household(auth.uid(), t.user_id)))
  )
$$;
revoke all on function public.task_visible_to_invoker(uuid) from public, anon, authenticated;

create or replace function public.guard_goal_link_target()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.supports_goal_task_id is not null
     and (tg_op = 'INSERT' or new.supports_goal_task_id is distinct from old.supports_goal_task_id) then
    if not public.task_visible_to_invoker(new.supports_goal_task_id) then
      raise exception 'that goal is not one you can link to'
        using errcode = '42501';
    end if;
    if not public.goal_link_target_is_goal(new.supports_goal_task_id, true) then
      raise exception 'this can only support a season goal'
        using errcode = '23514';
    end if;
  end if;
  if new.goal_task_id is not null
     and (tg_op = 'INSERT' or new.goal_task_id is distinct from old.goal_task_id) then
    if not public.task_visible_to_invoker(new.goal_task_id) then
      raise exception 'that goal is not one you can link to'
        using errcode = '42501';
    end if;
    if not public.goal_link_target_is_goal(new.goal_task_id, false) then
      raise exception 'a next action can only be filed under a goal'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
