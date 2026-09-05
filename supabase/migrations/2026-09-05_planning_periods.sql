-- 2026-09-05_planning_periods.sql
-- Planning lists (spec: docs/superpowers/specs/2026-09-05-planning-lists-and-lookback-design.md).
--
-- bucket='month' had no month and bucket='quarter' had no season, so a
-- September look-back was impossible: nothing knew what was September's. These
-- mirror week_start exactly — a DATE, NULL = "the current period" so nothing
-- planned before this ships changes behaviour. No backfill.
--
-- is_goal: a goal is an outcome you tick, never a thing you place. The writers
-- refuse to schedule/bucket-move a goal; it can be kept (copied forward),
-- dropped, or turned into a task.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS month_start  DATE,
  ADD COLUMN IF NOT EXISTS season_start DATE,
  ADD COLUMN IF NOT EXISTS is_goal      BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN tasks.month_start IS
  'Which month a bucket=month task belongs to (that month''s first day). NULL = the current month, legacy behavior.';
COMMENT ON COLUMN tasks.season_start IS
  'Which season a bucket=quarter task belongs to (that season''s start date, per the household''s configured boundaries). NULL = the current season, legacy behavior.';
COMMENT ON COLUMN tasks.is_goal IS
  'A goal on a month/season list: an outcome to tick, never placed onto a week or day. Writers refuse placement.';

CREATE INDEX IF NOT EXISTS tasks_month_start_idx  ON tasks (month_start)  WHERE month_start  IS NOT NULL;
CREATE INDEX IF NOT EXISTS tasks_season_start_idx ON tasks (season_start) WHERE season_start IS NOT NULL;

-- The household's own season groupings. Four {name, month, day} boundaries.
-- NULL until first read seeds the default (Oct 1 / Jan 1 / Apr 1 / Jul 1) —
-- Scott's next season starts in October; the others are his to adjust in
-- Settings. Owner-only update per the existing households RLS.
ALTER TABLE households
  ADD COLUMN IF NOT EXISTS seasons JSONB;

COMMENT ON COLUMN households.seasons IS
  'Array of four {name, month (1-12), day (1-31)} season boundaries, in calendar order. NULL = not yet seeded.';
