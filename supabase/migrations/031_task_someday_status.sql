-- Someday/Maybe Feature: Add is_someday column to tasks
-- Allows users to move non-urgent items out of inbox without scheduling them

-- Add is_someday column (boolean flag for someday items)
ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS is_someday BOOLEAN DEFAULT false;

-- Index for fast filtering of someday items
CREATE INDEX IF NOT EXISTS idx_tasks_someday
  ON tasks(is_someday)
  WHERE is_someday = true;

-- Composite index for user's someday items
CREATE INDEX IF NOT EXISTS idx_tasks_user_someday
  ON tasks(user_id, is_someday)
  WHERE is_someday = true;
