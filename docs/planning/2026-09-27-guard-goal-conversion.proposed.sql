-- PROPOSED — NOT APPLIED to the shared project. Proven on the isolated local
-- copy only (2026-09-27). Apply only with Scott's approval, as its own change.
--
-- guard_goal_support checks a link only when the row CARRYING it changes, so
-- two conversions strand a goal-supports-goal link (Codex review, 2026-09-27):
--   1. a season goal turned back into a task while a month goal supports it;
--   2. a linked month goal turned into a task, still carrying its link.
-- The app refuses both (goalToTaskConversion), but it cannot see rows RLS
-- hides from the person converting, so the database must also refuse.
-- SECURITY DEFINER is required for (1): the supporting month goal may be
-- another household member's private row that the caller cannot read.
create or replace function public.guard_goal_unconvert()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if coalesce(old.is_goal, false) and not coalesce(new.is_goal, false) then
    if new.supports_goal_task_id is not null then
      raise exception 'a goal that supports another goal cannot become a task; remove the link first'
        using errcode = '23514';
    end if;
    if exists (select 1 from public.tasks c where c.supports_goal_task_id = new.id) then
      raise exception 'a goal that other goals support cannot become a task; unlink them first'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_guard_goal_unconvert on public.tasks;
create trigger tasks_guard_goal_unconvert
  before update of is_goal on public.tasks
  for each row execute function public.guard_goal_unconvert();
