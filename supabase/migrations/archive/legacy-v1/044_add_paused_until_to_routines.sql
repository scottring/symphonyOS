-- Add paused_until field to routines table for timed pause functionality
ALTER TABLE routines
ADD COLUMN paused_until TIMESTAMPTZ NULL;

-- Add comment explaining the field
COMMENT ON COLUMN routines.paused_until IS 'When set, routine will auto-resume after this timestamp. When null and visibility=reference, routine is paused indefinitely.';

-- Create index for efficient queries to find routines that should auto-resume
CREATE INDEX idx_routines_paused_until ON routines(paused_until) WHERE paused_until IS NOT NULL;
