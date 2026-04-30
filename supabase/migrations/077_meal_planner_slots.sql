-- 077_meal_planner_slots.sql
-- Extend meal_plan_entries.slot to include the four canonical meals from the
-- v3 design: breakfast, lunch, snack, dinner. Keep the legacy per-person and
-- kid_alternate slots so existing rows don't fail validation; new code prefers
-- the canonical four.

alter table meal_plan_entries
  drop constraint meal_plan_entries_slot_check;

alter table meal_plan_entries
  add constraint meal_plan_entries_slot_check
    check (slot in (
      'breakfast', 'lunch', 'snack', 'dinner', 'prep',
      'lunch_iris', 'lunch_scott', 'kid_alternate'
    ));
