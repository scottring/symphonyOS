-- Change deferred_until from DATE to TIMESTAMPTZ to support hourly deferrals
-- Existing DATE values will be converted to timestamps at midnight UTC

ALTER TABLE tasks
ALTER COLUMN deferred_until TYPE TIMESTAMPTZ
USING deferred_until::TIMESTAMPTZ;

COMMENT ON COLUMN tasks.deferred_until IS 'When to resurface this task - supports both date and time-based deferrals';
