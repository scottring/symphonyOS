-- Add estimated_duration to tasks for planning session
-- Duration in minutes, nullable (30 min assumed in UI when null)

ALTER TABLE tasks ADD COLUMN estimated_duration integer;
