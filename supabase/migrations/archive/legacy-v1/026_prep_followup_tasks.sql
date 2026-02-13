-- Generalized prep/follow-up tasks system
-- Extends beyond just calendar events to support tasks, routines, and any activity

-- Add link type to distinguish prep vs followup
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS link_type text CHECK (link_type IN ('prep', 'followup'));

-- Add linked activity type and id (more flexible than just event linking)
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS linked_activity_type text CHECK (linked_activity_type IN ('task', 'routine_instance', 'calendar_event'));

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS linked_activity_id text;

-- Index for finding linked tasks
CREATE INDEX IF NOT EXISTS idx_tasks_linked_activity
  ON tasks(linked_activity_type, linked_activity_id)
  WHERE linked_activity_id IS NOT NULL;

-- Add prep/followup templates to routines
ALTER TABLE routines
  ADD COLUMN IF NOT EXISTS prep_task_templates jsonb DEFAULT '[]'::jsonb;

ALTER TABLE routines
  ADD COLUMN IF NOT EXISTS followup_task_templates jsonb DEFAULT '[]'::jsonb;

-- Migrate existing linkedEventId data to new structure for consistency
-- (keeping linked_event_id column for backward compatibility)
UPDATE tasks
SET linked_activity_type = 'calendar_event',
    linked_activity_id = linked_event_id,
    link_type = 'prep'
WHERE linked_event_id IS NOT NULL
  AND linked_activity_id IS NULL;
