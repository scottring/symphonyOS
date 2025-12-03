-- Add is_all_day column to tasks table
-- Distinguishes between all-day tasks and tasks scheduled for a specific time

ALTER TABLE tasks
ADD COLUMN is_all_day BOOLEAN DEFAULT false;

-- Update existing tasks: if they have a scheduled_for time at midnight, treat as all-day
UPDATE tasks
SET is_all_day = true
WHERE scheduled_for IS NOT NULL
  AND EXTRACT(HOUR FROM scheduled_for) = 0
  AND EXTRACT(MINUTE FROM scheduled_for) = 0;
