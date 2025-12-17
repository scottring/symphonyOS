-- Migration: add_contact_enrichment.sql
-- Add category, family fields, and preferences to contacts for Second Brain Phase 1

-- Add category column with enum constraint
ALTER TABLE contacts
ADD COLUMN category TEXT CHECK (category IN (
  'family', 'friend', 'service_provider', 'professional', 'school', 'medical', 'other'
));

-- Add family/personal fields
ALTER TABLE contacts ADD COLUMN birthday DATE;
ALTER TABLE contacts ADD COLUMN relationship TEXT;
ALTER TABLE contacts ADD COLUMN preferences TEXT;

-- Index for category filtering
CREATE INDEX idx_contacts_category ON contacts(user_id, category);

-- Comment on columns for documentation
COMMENT ON COLUMN contacts.category IS 'Contact type: family, friend, service_provider, professional, school, medical, other';
COMMENT ON COLUMN contacts.birthday IS 'Birthday (date only, year optional for privacy)';
COMMENT ON COLUMN contacts.relationship IS 'Relationship descriptor (e.g., son, spouse, mother)';
COMMENT ON COLUMN contacts.preferences IS 'Freeform preferences and facts about the contact';
