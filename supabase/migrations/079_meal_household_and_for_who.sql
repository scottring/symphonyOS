-- 079_meal_household_and_for_who.sql
-- Two fixes:
--   (1) Per-person variants. Adds `family_member_id` to meal_plan_entries so
--       each meal slot can carry an Iris row, a Scott row, a Kids row, or one
--       shared "family-default" row (NULL).
--   (2) Household sharing. Replaces "auth.uid() = user_id" RLS with
--       users_share_household(auth.uid(), user_id) on the six tables that
--       represent shared family meal data: meal_plans, meal_plan_entries,
--       recipes, cooking_history, weekly_briefs, standing_habits. Per-user
--       privacy stays intact for meal_day_logs (weight/notes) and
--       ai_undo_tokens (private undo state).

-- ─────────────────────────────────────────────────────────────────
-- (1) family_member_id on meal_plan_entries
-- ─────────────────────────────────────────────────────────────────

alter table meal_plan_entries
  add column family_member_id uuid references family_members(id) on delete set null;

create index meal_plan_entries_family_member_idx
  on meal_plan_entries(meal_plan_id, day_of_week, slot, family_member_id);

-- ─────────────────────────────────────────────────────────────────
-- (2) Household-aware RLS
-- ─────────────────────────────────────────────────────────────────

-- meal_plans
drop policy if exists "users can view own meal plans" on meal_plans;
drop policy if exists "users can insert own meal plans" on meal_plans;
drop policy if exists "users can update own meal plans" on meal_plans;
drop policy if exists "users can delete own meal plans" on meal_plans;

create policy "household members can view meal plans"
  on meal_plans for select
  using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));

create policy "users can insert own meal plans"
  on meal_plans for insert
  with check (auth.uid() = user_id);

create policy "household members can update meal plans"
  on meal_plans for update
  using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));

create policy "household members can delete meal plans"
  on meal_plans for delete
  using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));

-- meal_plan_entries — visibility flows through the parent meal_plan
drop policy if exists "users can view own meal plan entries" on meal_plan_entries;
drop policy if exists "users can insert own meal plan entries" on meal_plan_entries;
drop policy if exists "users can update own meal plan entries" on meal_plan_entries;
drop policy if exists "users can delete own meal plan entries" on meal_plan_entries;

create policy "household members can view meal plan entries"
  on meal_plan_entries for select
  using (exists (
    select 1 from meal_plans p
    where p.id = meal_plan_entries.meal_plan_id
      and (p.user_id = auth.uid() or users_share_household(auth.uid(), p.user_id))
  ));

create policy "household members can insert meal plan entries"
  on meal_plan_entries for insert
  with check (exists (
    select 1 from meal_plans p
    where p.id = meal_plan_entries.meal_plan_id
      and (p.user_id = auth.uid() or users_share_household(auth.uid(), p.user_id))
  ));

create policy "household members can update meal plan entries"
  on meal_plan_entries for update
  using (exists (
    select 1 from meal_plans p
    where p.id = meal_plan_entries.meal_plan_id
      and (p.user_id = auth.uid() or users_share_household(auth.uid(), p.user_id))
  ));

create policy "household members can delete meal plan entries"
  on meal_plan_entries for delete
  using (exists (
    select 1 from meal_plans p
    where p.id = meal_plan_entries.meal_plan_id
      and (p.user_id = auth.uid() or users_share_household(auth.uid(), p.user_id))
  ));

-- recipes — shared family library
drop policy if exists "users can view own recipes" on recipes;
drop policy if exists "users can insert own recipes" on recipes;
drop policy if exists "users can update own recipes" on recipes;
drop policy if exists "users can delete own recipes" on recipes;

create policy "household members can view recipes"
  on recipes for select
  using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));

create policy "users can insert own recipes"
  on recipes for insert
  with check (auth.uid() = user_id);

create policy "household members can update recipes"
  on recipes for update
  using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));

create policy "household members can delete recipes"
  on recipes for delete
  using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));

-- cooking_history — shared (we cooked X tonight)
drop policy if exists "users can view own cooking history" on cooking_history;
drop policy if exists "users can insert own cooking history" on cooking_history;
drop policy if exists "users can update own cooking history" on cooking_history;
drop policy if exists "users can delete own cooking history" on cooking_history;

create policy "household members can view cooking history"
  on cooking_history for select
  using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));

create policy "users can insert own cooking history"
  on cooking_history for insert
  with check (auth.uid() = user_id);

create policy "users can update own cooking history"
  on cooking_history for update
  using (auth.uid() = user_id);

create policy "users can delete own cooking history"
  on cooking_history for delete
  using (auth.uid() = user_id);

-- weekly_briefs — Iris writes, family reads
drop policy if exists "users can view own weekly briefs" on weekly_briefs;
drop policy if exists "users can insert own weekly briefs" on weekly_briefs;
drop policy if exists "users can update own weekly briefs" on weekly_briefs;
drop policy if exists "users can delete own weekly briefs" on weekly_briefs;

create policy "household members can view weekly briefs"
  on weekly_briefs for select
  using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));

create policy "users can insert own weekly briefs"
  on weekly_briefs for insert
  with check (auth.uid() = user_id);

create policy "users can update own weekly briefs"
  on weekly_briefs for update
  using (auth.uid() = user_id);

create policy "users can delete own weekly briefs"
  on weekly_briefs for delete
  using (auth.uid() = user_id);

-- standing_habits — each user has their own, family can see them
drop policy if exists "users can view own standing habits" on standing_habits;
drop policy if exists "users can insert own standing habits" on standing_habits;
drop policy if exists "users can update own standing habits" on standing_habits;
drop policy if exists "users can delete own standing habits" on standing_habits;

create policy "household members can view standing habits"
  on standing_habits for select
  using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));

create policy "users can insert own standing habits"
  on standing_habits for insert
  with check (auth.uid() = user_id);

create policy "users can update own standing habits"
  on standing_habits for update
  using (auth.uid() = user_id);

create policy "users can delete own standing habits"
  on standing_habits for delete
  using (auth.uid() = user_id);
