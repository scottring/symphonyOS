-- 2026-07-24_tasks_week_start.sql
-- Placement cascade: a month move places onto a WEEK, not a day.
--
-- bucket='week' previously meant, implicitly, "the current week" — which made any
-- other week unaddressable and is the root of the week-boundary schism (a
-- mid-period session planning a week that has already passed).
--
-- week_start makes the week explicit: bucket='week' + week_start='2026-07-20'
-- = "the week of the 20th". Additive and NULL-safe — NULL keeps meaning "the
-- current week" so nothing planned before this ships changes behavior. No backfill.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS week_start DATE;

COMMENT ON COLUMN tasks.week_start IS
  'Which week a bucket=week task belongs to (that week''s start date, per the user''s weekStartsOn). NULL = the current week, legacy behavior.';

CREATE INDEX IF NOT EXISTS tasks_week_start_idx ON tasks (week_start) WHERE week_start IS NOT NULL;
