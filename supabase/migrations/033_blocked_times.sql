-- Add blocked_times JSONB column to family_members
-- Stores recurring time blocks when a member is unavailable (work, school, etc.)
--
-- Structure: [{ name: string, days: string[], start: string, end: string }]
-- Example: [{ "name": "Work", "days": ["mon","tue","wed","thu","fri"], "start": "07:00", "end": "18:00" }]

ALTER TABLE family_members
  ADD COLUMN IF NOT EXISTS blocked_times jsonb DEFAULT '[]'::jsonb;

-- Add a comment for documentation
COMMENT ON COLUMN family_members.blocked_times IS 'Recurring time blocks when member is unavailable. Array of {name, days[], start, end}';
