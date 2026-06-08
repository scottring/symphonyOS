-- Phase 3 — shared artifact home for the cadence sessions.
-- One row per (author, horizon, period); household members can see + edit each
-- other's rows (couple ritual). Reflective substance lives in `notes` jsonb as
-- shared plain text for Phase 3; richer vault links are Phase 4.

create table if not exists planning_sessions (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  horizon text not null check (horizon in ('daily','weekly','monthly','seasonal','annual')),
  period_token text not null,
  notes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (author_id, horizon, period_token)
);

create index if not exists planning_sessions_author_idx on planning_sessions(author_id);

alter table planning_sessions enable row level security;

-- Household-shared visibility, mirroring the scope-axis policies.
drop policy if exists "view planning_sessions" on planning_sessions;
create policy "view planning_sessions" on planning_sessions for select
  using (auth.uid() = author_id or users_share_household(auth.uid(), author_id));

drop policy if exists "insert planning_sessions" on planning_sessions;
create policy "insert planning_sessions" on planning_sessions for insert
  with check (auth.uid() = author_id);

drop policy if exists "update planning_sessions" on planning_sessions;
create policy "update planning_sessions" on planning_sessions for update
  using (auth.uid() = author_id or users_share_household(auth.uid(), author_id));

drop policy if exists "delete planning_sessions" on planning_sessions;
create policy "delete planning_sessions" on planning_sessions for delete
  using (auth.uid() = author_id);
