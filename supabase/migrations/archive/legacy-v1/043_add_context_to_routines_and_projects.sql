-- Add context field to routines and projects
-- Allows filtering by life domain (work, family, personal)

-- Add context to routines
ALTER TABLE routines
  ADD COLUMN context TEXT CHECK (context IN ('work', 'family', 'personal'));

-- Add context to projects
ALTER TABLE projects
  ADD COLUMN context TEXT CHECK (context IN ('work', 'family', 'personal'));

-- Create indexes for efficient filtering
CREATE INDEX idx_routines_context ON routines(user_id, context) WHERE context IS NOT NULL;
CREATE INDEX idx_projects_context ON projects(user_id, context) WHERE context IS NOT NULL;
