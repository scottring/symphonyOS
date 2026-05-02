-- 090_onboarding_v2_meal_rhythms.sql
-- Schema additions for the meal-first onboarding flow (see
-- docs/design_handoff_onboarding_flow/README.md and
-- tasks/onboarding-flow-v2.md).
--
-- 1. user_profiles gains two jsonb columns captured during onboarding:
--    household       — { adults: [{name, role?}], kids: [{name, age}] }
--    season_goals    — { selected: string[], custom?: string }
--
-- 2. standing_habits gains three columns to support the rhythms parser:
--    detail            — second-line text ("kids: HB eggs + sweet potato")
--    contributes_grams — fruit/veg grams toward 800g target
--    when_label        — display label ("Mornings", "Off-night", "Batch-day")
--                        slot remains the canonical meal-slot used by the
--                        plan generator; when_label is human-readable rhythm
--                        context shown in onboarding + habits UI.
--
-- The slot CHECK constraint is intentionally untouched. Off-night / Batch-day
-- rhythms map to slot=dinner with when_label set; v1 surfaces them in the UI
-- but does not feed them into plan generation.

-- ─────────────────────────────────────────────────────────────────
-- user_profiles additions
-- ─────────────────────────────────────────────────────────────────
alter table user_profiles
  add column if not exists household jsonb not null default '{}'::jsonb;

alter table user_profiles
  add column if not exists season_goals jsonb not null default '{}'::jsonb;

comment on column user_profiles.household is
  'Onboarding capture: { adults: [{name, role?}], kids: [{name, age}] }';
comment on column user_profiles.season_goals is
  'Onboarding capture: { selected: string[], custom?: string }';

-- ─────────────────────────────────────────────────────────────────
-- standing_habits additions
-- ─────────────────────────────────────────────────────────────────
alter table standing_habits
  add column if not exists detail text;

alter table standing_habits
  add column if not exists contributes_grams integer;

alter table standing_habits
  add column if not exists when_label text;

comment on column standing_habits.detail is
  'Optional second line — portion / who-applies-to ("kids: HB eggs + sweet potato")';
comment on column standing_habits.contributes_grams is
  'Estimated fruit+veg grams toward the 800g target';
comment on column standing_habits.when_label is
  'Display label for rhythm UI ("Mornings", "Off-night", "Batch-day"). slot stays canonical.';
