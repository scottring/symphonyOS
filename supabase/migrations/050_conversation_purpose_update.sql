-- ============================================================================
-- UPDATE CONVERSATIONS TABLE: Add new purpose values for domain assessments
-- ============================================================================
-- The conduct-onboarding-conversation edge function now supports:
-- - 'domain-assessment' mode for individual domain deep assessments
-- - 'individual-profile' mode for per-person profiling
-- These need to be added to the purpose CHECK constraint.
-- Also adds person_id column for individual profile conversations.
-- ============================================================================

-- Drop and recreate the CHECK constraint with new values
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_purpose_check;
ALTER TABLE conversations ADD CONSTRAINT conversations_purpose_check
  CHECK (purpose IN ('onboarding', 'coaching', 'checkin', 'facilitation', 'refresh', 'domain-assessment', 'individual-profile'));

-- Add person_id column for individual profile conversations
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES family_members(id) ON DELETE SET NULL;
