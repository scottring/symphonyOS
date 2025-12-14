-- Add project_id to lists table for linking lists to projects
-- Example: "Montreal Restaurants" list linked to "Plan Montreal Trip" project

ALTER TABLE lists
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

-- Index for efficient lookup of lists by project
CREATE INDEX IF NOT EXISTS idx_lists_project_id ON lists(project_id);

-- Comment for documentation
COMMENT ON COLUMN lists.project_id IS 'Optional link to a project - allows grouping lists under projects';
