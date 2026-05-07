-- 092_event_discussion_flags.sql
-- Symphony-side annotation flagging Google Calendar events for discussion.
-- Mirrors hidden_calendar_events: keyed by google_event_base_id so flagging
-- a recurring event flags the whole series.

CREATE TABLE IF NOT EXISTS event_discussion_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  google_event_base_id TEXT NOT NULL,
  event_title TEXT,
  calendar_id TEXT,
  discussion_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT event_discussion_flags_unique UNIQUE (user_id, google_event_base_id)
);

CREATE INDEX IF NOT EXISTS idx_event_discussion_flags_user_calendar
  ON event_discussion_flags (user_id, calendar_id);

ALTER TABLE event_discussion_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own discussion flags"
  ON event_discussion_flags
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- updated_at trigger uses shared function defined in 002_*.sql.
CREATE TRIGGER update_event_discussion_flags_updated_at
  BEFORE UPDATE ON event_discussion_flags
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
