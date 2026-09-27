-- PREPARED — NOT APPLIED to the shared project. Apply only with Scott's
-- explicit approval, as its own step (see the release order in
-- docs/planning/2026-09-27-everyday-horizons.md).
-- Proof: supabase/tests/101_guard_goal_conversion.test.sql (invariant, as
-- postgres, rolled back) and supabase/tests/guard_goal_conversion.concurrency.mjs
-- (two real connections as `authenticated`, RLS on — races and hidden rows).
-- Rollback: supabase/migrations/rollback/2026-09-27_guard_goal_conversion.down.sql
-- Existing data: a read-only count on 2026-09-27 found no row breaking the
-- invariant (and no goal links at all); the guard validates only CHANGES.
--
-- THE INVARIANT: no goal link points at a row that is not a goal —
--   supports_goal_task_id (a month goal supporting a season goal), and
--   goal_task_id (a next action filed under a goal).
--
-- guard_goal_support checks a link only when the row CARRYING it changes,
-- and reads the parent without a lock. So (proven locally, v1 of this file
-- included):
--   * a goal could be turned back into a task while a goal or next action
--     still pointed at it — including rows RLS hides from the person
--     converting, which the app cannot see to refuse;
--   * two transactions racing (link vs. convert, either order, either commit
--     order) could both commit and leave an invalid link: an uncommitted
--     child is invisible to the reverse check, and the foreign key's KEY SHARE
--     lock does not conflict with an update of is_goal.
--
-- THE FIX, both paths coordinated on the PARENT row:
--   * the link path locks the parent FOR SHARE and re-reads it (READ
--     COMMITTED follows a concurrent update to its committed version);
--   * the conversion path's UPDATE takes the parent's row lock, which
--     conflicts with FOR SHARE, and only then checks for children with a
--     fresh snapshot. Whichever reaches the parent second waits for the
--     first, then sees what it committed.
-- Both functions are SECURITY DEFINER because the rows involved may be
-- another member's private rows; refusals name nothing.
--
-- INTENTIONAL NEW RULE: a next action may be filed under a goal only
-- (goal_task_id must point at an is_goal row when it is SET). The app only
-- ever does this; without it the link path has nothing to re-check. Rows
-- already stored are not re-validated — only a change to the link is.
--
-- NOT COVERED (documented, out of scope): moving a season goal to another
-- bucket, or deleting a goal (the foreign keys already SET NULL on delete).

create or replace function public.goal_link_target_is_goal(p_parent uuid, p_season_only boolean)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
declare
  r record;
begin
  -- The lock that makes a concurrent conversion of this parent wait for us
  -- (or makes us wait for it, and then read its committed state).
  select t.is_goal, t.bucket into r from public.tasks t where t.id = p_parent for share;
  if not found then
    return true;  -- the foreign key reports a missing parent
  end if;
  return coalesce(r.is_goal, false) and (not p_season_only or r.bucket = 'quarter');
end;
$$;

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
    -- This row is already locked by the UPDATE that fired us, so a linker
    -- holding FOR SHARE on it has committed or rolled back by now; this
    -- query takes a fresh snapshot and sees what it committed.
    if exists (select 1 from public.tasks c
               where c.supports_goal_task_id = new.id or c.goal_task_id = new.id) then
      raise exception 'a goal with linked goals or next actions cannot become a task; unlink them first'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

-- Named to fire AFTER tasks_guard_goal_support (triggers run in name order),
-- so that guard's specific messages are kept for a visibly wrong link.
drop trigger if exists tasks_guard_goal_target_lock on public.tasks;
create trigger tasks_guard_goal_target_lock
  before insert or update of supports_goal_task_id, goal_task_id on public.tasks
  for each row execute function public.guard_goal_link_target();

drop trigger if exists tasks_guard_goal_unconvert on public.tasks;
create trigger tasks_guard_goal_unconvert
  before update of is_goal on public.tasks
  for each row execute function public.guard_goal_unconvert();

revoke all on function public.goal_link_target_is_goal(uuid, boolean) from public, anon, authenticated;
