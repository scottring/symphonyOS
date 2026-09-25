-- A goal can support the goal above it: a month goal supports a season goal,
-- a season goal supports a year goal.
--
-- This is NOT `goal_task_id`. That column means "is a step of", and
-- keepForward reads it to carry a goal's open steps along when the goal moves
-- (useSupabaseTasks.keepForward → stepsThatCarryForward). Putting goal→goal in
-- it would make a parent goal drag its child goals across periods the moment a
-- task carried forward — which is exactly the coupling this column exists to
-- avoid. The two relationships stay separate columns so no reader has to
-- remember which meaning it is looking at.
--
-- The other half of the pair needs no column: a season goal's parent is a
-- YEAR goal, which is a `goals` row, not a task, so it is already recorded on
-- `tasks.goal_id` ("the annual goal this task ultimately serves").
--
--   month goal  --supports_goal_task_id-->  season goal  (tasks row, is_goal)
--   season goal --goal_id---------------->  year goal    (goals row)
--   task        --goal_task_id----------->  its goal     (a STEP; carried)
--
-- The link points UP, from child to parent, so moving or carrying forward a
-- task can never move a goal: nothing above it holds a pointer down.
--
-- Losing a goal must not lose the record of what supported it, so a deleted
-- parent leaves its children in place, unlinked, rather than cascading.
alter table public.tasks
  add column if not exists supports_goal_task_id uuid references public.tasks(id) on delete set null;

create index if not exists tasks_supports_goal_task_id_idx
  on public.tasks(supports_goal_task_id)
  where supports_goal_task_id is not null;

comment on column public.tasks.supports_goal_task_id is
  'The season goal (is_goal task, bucket=quarter) that this month goal supports. Distinct from goal_task_id (a STEP under a goal, carried forward with it) and goal_id (the annual goals-table row).';

-- Validate the link at the moment it is SET.
--
-- Only when the value changes: an unrelated write to a linked row (a keep, a
-- rename, a completion) is never blocked, and no existing row is invalidated
-- retroactively by this migration. A row whose hierarchy stops holding later —
-- a month goal promoted to a season goal, say — keeps its stored link and the
-- readers ignore it; that is recoverable, where raising on an unrelated write
-- would break flows this column knows nothing about.
--
-- Note the shape rules make a cycle impossible without checking for one: the
-- child must be bucket='month' and the parent bucket='quarter', so a row that
-- HAS a parent can never BE one.
create or replace function public.guard_goal_support()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent public.tasks%rowtype;
begin
  if new.supports_goal_task_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.supports_goal_task_id is not distinct from old.supports_goal_task_id then
    return new;
  end if;

  if new.supports_goal_task_id = new.id then
    raise exception 'a goal cannot support itself'
      using errcode = '23514';
  end if;

  if not coalesce(new.is_goal, false) or new.bucket <> 'month' then
    raise exception 'only a month goal may support a season goal'
      using errcode = '23514',
            hint = 'A step belongs under goal_task_id; a season goal records its year goal on goal_id.';
  end if;

  select * into parent from public.tasks where id = new.supports_goal_task_id;
  if not found then
    raise exception 'the supported goal does not exist'
      using errcode = '23503';
  end if;

  if not coalesce(parent.is_goal, false) or parent.bucket <> 'quarter' then
    raise exception 'a month goal may only support a SEASON goal'
      using errcode = '23514',
            hint = 'The supported row must be an is_goal task on a season list.';
  end if;

  -- Same household, judged exactly as every sharing predicate on tasks judges
  -- it. Assignment does not widen this: a goal you can see because it was
  -- assigned to you still belongs to its owner's household.
  if not public.users_share_household(new.user_id, parent.user_id) then
    raise exception 'a goal may only support a goal in the same household'
      using errcode = '42501';
  end if;

  return new;
end
$$;

drop trigger if exists tasks_guard_goal_support on public.tasks;
create trigger tasks_guard_goal_support
  before insert or update of supports_goal_task_id, is_goal, bucket on public.tasks
  for each row execute function public.guard_goal_support();
