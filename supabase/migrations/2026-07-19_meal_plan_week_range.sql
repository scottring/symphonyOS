-- 2026-07-19_meal_plan_week_range.sql
-- Partial weeks: a plan can declare an active starts_on..ends_on range within
-- its Sunday-anchored week. NULL = unbounded on that side; both NULL = the
-- full Sunday..Saturday week (all pre-existing rows). Entries outside the
-- range are kept, just hidden by the client.
alter table public.meal_plans
  add column if not exists starts_on date,
  add column if not exists ends_on date;

alter table public.meal_plans drop constraint if exists meal_plans_range_within_week;
alter table public.meal_plans add constraint meal_plans_range_within_week check (
  (starts_on is null or (starts_on >= week_start and starts_on <= week_start + 6))
  and (ends_on is null or (ends_on >= week_start and ends_on <= week_start + 6))
  and (starts_on is null or ends_on is null or starts_on <= ends_on)
);
