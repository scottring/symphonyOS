-- Add health and profile columns to family_members table
-- These fields enable system-wide personalization across Symphony OS

-- Add health profile fields
ALTER TABLE family_members
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS age_range TEXT CHECK (age_range IN ('infant', 'toddler', 'child', 'teen', 'adult')),
  ADD COLUMN IF NOT EXISTS allergies JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS medications JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS dietary_restrictions JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS health_conditions JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS mobility_needs TEXT;

-- Add indexes for efficient queries on JSONB fields
CREATE INDEX IF NOT EXISTS idx_family_members_allergies
  ON family_members USING GIN (allergies);

CREATE INDEX IF NOT EXISTS idx_family_members_medications
  ON family_members USING GIN (medications);

CREATE INDEX IF NOT EXISTS idx_family_members_dietary_restrictions
  ON family_members USING GIN (dietary_restrictions);

CREATE INDEX IF NOT EXISTS idx_family_members_health_conditions
  ON family_members USING GIN (health_conditions);

-- Add comments for documentation
COMMENT ON COLUMN family_members.date_of_birth IS 'Optional birth date for age-appropriate recommendations';
COMMENT ON COLUMN family_members.age_range IS 'Age category: infant, toddler, child, teen, adult';
COMMENT ON COLUMN family_members.allergies IS 'Array of allergen strings (e.g., ["peanuts", "shellfish"])';
COMMENT ON COLUMN family_members.medications IS 'Array of medication objects with name, dosage, frequency';
COMMENT ON COLUMN family_members.dietary_restrictions IS 'Array of dietary restriction strings (e.g., ["vegetarian", "gluten-free"])';
COMMENT ON COLUMN family_members.health_conditions IS 'Array of health condition strings for context';
COMMENT ON COLUMN family_members.mobility_needs IS 'Text description of mobility or accessibility needs';
