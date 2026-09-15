-- A step serves a goal. The goal is an is_goal task row on the same month or
-- season list, so the link points back into `tasks` itself.
--
-- Distinct from the two columns that already look like it:
--   source_id — "copied down FROM", the placement lineage
--   goal_id   — the annual goals-table row this ultimately serves
-- This one says "belongs under", and it is what lets a goal hold the work.
--
-- Losing a goal must never lose the work, so a deleted goal leaves its steps
-- behind as loose rows rather than cascading them away.
alter table public.tasks
  add column if not exists goal_task_id uuid references public.tasks(id) on delete set null;

create index if not exists tasks_goal_task_id_idx
  on public.tasks(goal_task_id)
  where goal_task_id is not null;

comment on column public.tasks.goal_task_id is
  'The is_goal task row this step serves (month/season only). Distinct from source_id (copied-down-from) and goal_id (the annual goals-table row).';
