-- Guided planning sessions: private session notes, life areas that carry a
-- space, tasks filed under an area, and wall notes that can expire.

-- 1. Session notes are private to their author. The 2026-06-08 policies let
--    household members read and edit each other's notes; that ends here.
drop policy if exists "view planning_sessions" on public.planning_sessions;
create policy "view planning_sessions" on public.planning_sessions for select
  using (auth.uid() = author_id);

drop policy if exists "update planning_sessions" on public.planning_sessions;
create policy "update planning_sessions" on public.planning_sessions for update
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

-- 2. A life area belongs to a space. Null (legacy rows) stays private to the
--    owner; only 'family' areas are visible to the household. Writes stay
--    owner-only (insert/update/delete policies are unchanged).
alter table public.goal_areas
  add column if not exists context text null
  check (context in ('work', 'family', 'personal'));

drop policy if exists "Users can read their own goal areas" on public.goal_areas;
create policy "Users can read their own goal areas" on public.goal_areas for select
  using (
    (select auth.uid()) = user_id
    or (context = 'family' and user_id in (select public.my_household_user_ids()))
  );

-- 3. A task can be filed under a life area.
alter table public.tasks
  add column if not exists area_id uuid null references public.goal_areas(id) on delete set null;
create index if not exists tasks_area_id_idx on public.tasks(area_id) where area_id is not null;

-- 4. Wall notes can expire.
alter table public.scratchpad_notes
  add column if not exists expires_at timestamptz null;

-- 5. Removing a life area keeps the goals filed under it, with no area. The
--    046 link was ON DELETE CASCADE: removing an area deleted every year goal
--    under it, a partner's goals under a Family area included.
alter table public.goals drop constraint if exists goals_area_id_fkey;
alter table public.goals add constraint goals_area_id_fkey
  foreign key (area_id) references public.goal_areas(id) on delete set null;
