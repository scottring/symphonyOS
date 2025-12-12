-- Fix project status values to match frontend
-- The original schema only allowed: 'not_started', 'active', 'completed'
-- But the frontend uses: 'not_started', 'in_progress', 'on_hold', 'completed'

-- First, update any 'active' values to 'in_progress' for consistency
UPDATE projects SET status = 'in_progress' WHERE status = 'active';

-- Drop the old constraint and add the new one
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE projects ADD CONSTRAINT projects_status_check
  CHECK (status IN ('not_started', 'in_progress', 'on_hold', 'completed'));
