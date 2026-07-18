-- 2026-07-18_meal_teardown.sql
-- Task 9 of the meal-planner teardown: drop the eight dead tables + dead
-- columns whose application code was removed in Tasks 1-8. Approved
-- destructive DDL — see .superpowers/sdd/task-9-brief.md and
-- .superpowers/sdd/task-9-report.md for the full inspection trail
-- (row counts, RLS check, dependency check) recorded before this ran.
--
-- NOTE: this file is a record of what was ACTUALLY executed against prod via
-- the Supabase Management API (statement by statement, verifying no
-- dependency errors between steps) — it is not itself re-run by a migration
-- runner. Column reality differed slightly from the brief's archaeology:
--   - meal_plan_entries has no `user_id` or `updated_at` column (never had
--     one) — nothing to keep/drop there, the brief's keep-list was just
--     slightly off from actual schema.
--   - meal_plan_entries.leftover_from (not leftover_from_id) is the live,
--     in-use FK column (referenced by src/hooks/useMealPlan.ts) — kept as-is.
--   - meal_plans had NO extra household/scoping column; RLS depends only on
--     meal_plans.user_id (+ users_share_household()), so nothing extra to
--     keep beyond the brief's list.
--   - Four sibling columns from 076_meal_today_tracking.sql
--     (actual_grams, swap_grams, swap_title, tracking_updated_at) exist
--     alongside tracking_state but were NOT named in the brief's drop list
--     and had no application references (grepped clean). Initially left in
--     place per the "unknown column → do not drop, flag it" instruction and
--     flagged in the report; coordinator granted sign-off same day, citing
--     the approved design spec's explicit line that "day-logs, grams
--     tracking, what-we-ate tracking all die" — dropped as a follow-up
--     statement below.

-- ── meal_plan_entries: drop non-core slots, tighten the slot check ────────
delete from meal_plan_entries where slot not in ('breakfast','lunch','dinner');
-- (28 rows deleted: 7 'prep' + 21 'snack' — see task-9-report.md)

alter table meal_plan_entries drop constraint if exists meal_plan_entries_slot_check;
alter table meal_plan_entries add constraint meal_plan_entries_slot_check
  check (slot in ('breakfast','lunch','dinner'));

-- ── dead columns from the never-adopted family-assignment + tracking features ──
alter table meal_plan_entries
  drop column if exists family_member_id,
  drop column if exists prepared_by_family_member_id,
  drop column if exists tracking_state;

alter table meal_plans drop column if exists parameter;

drop function if exists regenerate_meal_plan(uuid, jsonb);

-- ── eight dead tables (never-adopted features; app code removed in Tasks 1-8) ──
-- Verified no live dependencies first (no FKs from other tables, no views,
-- no function bodies referencing them) — each drop below succeeded without
-- needing CASCADE, run one table at a time.
drop table if exists meal_day_logs;
drop table if exists standing_habits;
drop table if exists weekly_briefs;
drop table if exists pantry_inventory;
drop table if exists cooking_history;
drop table if exists ai_undo_tokens;
drop table if exists grocery_store_overrides;
drop table if exists dietary_restrictions;

-- ── follow-up (same day, sign-off granted): drop the 4 flagged diet-tracking
--    columns above — approved spec explicitly cuts grams/what-we-ate tracking ──
alter table meal_plan_entries
  drop column if exists actual_grams,
  drop column if exists swap_grams,
  drop column if exists swap_title,
  drop column if exists tracking_updated_at;
