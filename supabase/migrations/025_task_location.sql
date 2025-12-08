-- Add location fields to tasks table
-- Enables attaching a location/address to tasks for directions

ALTER TABLE tasks
ADD COLUMN location TEXT,
ADD COLUMN location_place_id TEXT;

-- Index for tasks with locations (for potential future "nearby tasks" features)
CREATE INDEX tasks_location_idx ON tasks(location) WHERE location IS NOT NULL;
