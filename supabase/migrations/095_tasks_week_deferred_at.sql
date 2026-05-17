-- 095_tasks_week_deferred_at.sql
-- Persist weekDeferredAt so "Next Week" sort order survives page refresh.
-- Set when an item already in the 'week' bucket is bumped to next week —
-- sinks it to the bottom of the This Week popover.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS week_deferred_at TIMESTAMPTZ;
