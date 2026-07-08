-- goal_milestones — measurable checkpoints under a goal (used by GoalView +
-- useGoalMilestones since the goals system shipped, but the table was created
-- directly in prod and never captured as a migration). This file documents the
-- LIVE schema (dumped 2026-07-08) so a fresh database matches production.
-- Idempotent: IF NOT EXISTS everywhere.

create table if not exists goal_milestones (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references goals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  target_date date,
  target_value numeric,
  current_value numeric default 0,
  unit text,
  status text not null default 'pending',
  sort_order integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table goal_milestones enable row level security;

-- Matches the live policy name/expression exactly (only the pkey index exists
-- in prod; none were added beyond it).
do $$ begin
  create policy "Users can manage own milestones" on goal_milestones
    for all using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
