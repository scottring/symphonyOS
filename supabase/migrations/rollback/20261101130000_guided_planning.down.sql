-- Undo 20261101130000_guided_planning.sql. Restores the 2026-06-08
-- household-shared planning_sessions policies and the owner-only goal_areas
-- select policy, and drops the new columns (their data is lost).
alter table public.scratchpad_notes drop column if exists expires_at;

drop index if exists public.tasks_area_id_idx;
alter table public.tasks drop column if exists area_id;

drop policy if exists "Users can read their own goal areas" on public.goal_areas;
create policy "Users can read their own goal areas" on public.goal_areas for select
  using (auth.uid() = user_id);
alter table public.goal_areas drop column if exists context;

drop policy if exists "view planning_sessions" on public.planning_sessions;
create policy "view planning_sessions" on public.planning_sessions for select
  using (auth.uid() = author_id or users_share_household(auth.uid(), author_id));

drop policy if exists "update planning_sessions" on public.planning_sessions;
create policy "update planning_sessions" on public.planning_sessions for update
  using (auth.uid() = author_id or users_share_household(auth.uid(), author_id));
