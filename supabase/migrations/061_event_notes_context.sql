-- Add context column to event_notes for per-event domain override
ALTER TABLE event_notes ADD COLUMN IF NOT EXISTS context text;
