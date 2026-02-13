-- Add multi-member assignment to event_notes
-- This allows events to be assigned to multiple family members (e.g., family dinners)
-- We keep the original assigned_to column for backwards compatibility

ALTER TABLE event_notes
  ADD COLUMN IF NOT EXISTS assigned_to_all uuid[] DEFAULT '{}';

-- Create index for array queries (GIN index for array containment)
CREATE INDEX IF NOT EXISTS idx_event_notes_assigned_to_all ON event_notes USING GIN (assigned_to_all);

-- Migrate existing single assignments to the array column
UPDATE event_notes
SET assigned_to_all = ARRAY[assigned_to]
WHERE assigned_to IS NOT NULL AND (assigned_to_all IS NULL OR assigned_to_all = '{}');
