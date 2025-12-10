-- Add category column to tasks table
-- Category represents family-native item types: task, chore, errand, event, activity
-- Defaults to 'task' for backwards compatibility with existing items

ALTER TABLE tasks
ADD COLUMN category TEXT DEFAULT 'task' CHECK (category IN ('task', 'chore', 'errand', 'event', 'activity'));

-- Index for category-based queries (filtering by type)
CREATE INDEX tasks_category_idx ON tasks(category);

-- Add descriptive comment
COMMENT ON COLUMN tasks.category IS 'Family item type: task (one-off action), chore (recurring household duty), errand (location-based), event (calendar-blocked), activity (kid-related)';
