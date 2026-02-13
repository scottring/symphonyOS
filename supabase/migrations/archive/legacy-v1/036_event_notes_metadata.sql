-- Add event metadata columns to event_notes table
-- These store the event title and start time so we can display linked events
-- without needing to re-fetch from Google Calendar (which is date-range limited)

ALTER TABLE event_notes ADD COLUMN IF NOT EXISTS event_title TEXT;
ALTER TABLE event_notes ADD COLUMN IF NOT EXISTS event_start_time TIMESTAMPTZ;

-- Create index for sorting linked events by date
CREATE INDEX IF NOT EXISTS event_notes_project_start_time_idx
  ON event_notes(project_id, event_start_time)
  WHERE project_id IS NOT NULL;
