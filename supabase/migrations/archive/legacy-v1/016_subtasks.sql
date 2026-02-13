-- Add parent_task_id to support subtasks
-- Subtasks are just tasks with a parent_task_id set
ALTER TABLE tasks ADD COLUMN parent_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE;

-- Index for efficient lookups of subtasks by parent
CREATE INDEX idx_tasks_parent_task_id ON tasks(parent_task_id);
