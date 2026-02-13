-- Event notes table for Symphony OS
-- Stores user notes for Google Calendar events (separate from GCal description)

CREATE TABLE event_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  google_event_id TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(user_id, google_event_id)
);

-- Index for efficient user queries
CREATE INDEX event_notes_user_id_idx ON event_notes(user_id);

-- Index for looking up notes by event
CREATE INDEX event_notes_google_event_id_idx ON event_notes(google_event_id);

-- Enable Row Level Security
ALTER TABLE event_notes ENABLE ROW LEVEL SECURITY;

-- Users can only see their own event notes
CREATE POLICY "Users can view own event notes"
  ON event_notes FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create their own event notes
CREATE POLICY "Users can create own event notes"
  ON event_notes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own event notes
CREATE POLICY "Users can update own event notes"
  ON event_notes FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own event notes
CREATE POLICY "Users can delete own event notes"
  ON event_notes FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger to update updated_at on changes (reuse existing function from tasks migration)
CREATE TRIGGER update_event_notes_updated_at
  BEFORE UPDATE ON event_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
