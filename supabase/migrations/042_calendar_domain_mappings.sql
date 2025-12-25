-- Calendar Domain Mappings
-- Allows users to assign calendars to specific domains (work, family, personal)

CREATE TABLE calendar_domain_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users NOT NULL,
  calendar_id TEXT NOT NULL, -- Google Calendar ID (usually email address)
  calendar_email TEXT NOT NULL,
  calendar_name TEXT NOT NULL,
  domain TEXT CHECK (domain IN ('work', 'family', 'personal')),
  access_role TEXT CHECK (access_role IN ('owner', 'writer', 'reader')) NOT NULL,
  is_default BOOLEAN DEFAULT FALSE, -- Default calendar for creating events in this domain
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicate calendar-domain assignments
  UNIQUE(user_id, calendar_id, domain)
);

-- Indexes for efficient queries
CREATE INDEX idx_calendar_domain_mappings_user_id ON calendar_domain_mappings(user_id);
CREATE INDEX idx_calendar_domain_mappings_domain ON calendar_domain_mappings(user_id, domain);

-- Row Level Security
ALTER TABLE calendar_domain_mappings ENABLE ROW LEVEL SECURITY;

-- Users can only see/modify their own calendar mappings
CREATE POLICY "Users can manage their own calendar domain mappings"
  ON calendar_domain_mappings
  FOR ALL
  USING (auth.uid() = user_id);

-- Function to ensure each domain has at most one default calendar
CREATE OR REPLACE FUNCTION ensure_single_default_calendar_per_domain()
RETURNS TRIGGER AS $$
BEGIN
  -- If setting this calendar as default, unset any other defaults in the same domain
  IF NEW.is_default = TRUE THEN
    UPDATE calendar_domain_mappings
    SET is_default = FALSE
    WHERE user_id = NEW.user_id
      AND domain = NEW.domain
      AND id != NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_ensure_single_default_calendar
  BEFORE INSERT OR UPDATE ON calendar_domain_mappings
  FOR EACH ROW
  EXECUTE FUNCTION ensure_single_default_calendar_per_domain();

-- Updated_at trigger
CREATE TRIGGER update_calendar_domain_mappings_updated_at
  BEFORE UPDATE ON calendar_domain_mappings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
