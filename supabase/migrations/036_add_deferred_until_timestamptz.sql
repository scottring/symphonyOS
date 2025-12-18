-- Add deferred_until column to tasks table
-- This allows time-based deferrals (e.g., "in 3 hours", "this evening")
-- Using TIMESTAMPTZ to store full date+time information

ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS deferred_until TIMESTAMPTZ;

-- Add index for efficient queries on deferred tasks
CREATE INDEX IF NOT EXISTS tasks_deferred_until_idx
ON tasks(deferred_until)
WHERE deferred_until IS NOT NULL;

-- Add defer_count column to track how many times a task has been deferred
ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS defer_count INTEGER DEFAULT 0 NOT NULL;
