-- Add project linking to event_notes
-- This allows calendar events to be associated with projects

ALTER TABLE event_notes
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

-- Create index for efficient project queries
CREATE INDEX IF NOT EXISTS idx_event_notes_project_id ON event_notes(project_id);
