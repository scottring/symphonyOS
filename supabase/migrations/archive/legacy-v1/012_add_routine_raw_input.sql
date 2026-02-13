-- Add raw_input column to routines table for natural language input storage
-- This stores the original natural language text that was parsed to create the routine

ALTER TABLE routines ADD COLUMN IF NOT EXISTS raw_input TEXT;

-- Add comment for documentation
COMMENT ON COLUMN routines.raw_input IS 'Original natural language input used to create the routine (e.g., "iris walks jax every weekday at 7am")';
