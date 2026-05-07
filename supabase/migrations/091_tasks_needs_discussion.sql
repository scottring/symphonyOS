-- 091_tasks_needs_discussion.sql
-- Adds the "needs discussion" flag and optional note to tasks.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS needs_discussion BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS discussion_note TEXT;

-- Partial index speeds up the kiosk family-domain query
CREATE INDEX IF NOT EXISTS idx_tasks_needs_discussion
  ON tasks (user_id, context)
  WHERE needs_discussion = TRUE;
