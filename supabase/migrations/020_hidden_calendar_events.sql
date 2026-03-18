-- Hidden calendar events: permanently suppress recurring events from showing
CREATE TABLE IF NOT EXISTS hidden_calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  google_event_base_id TEXT NOT NULL,
  event_title TEXT,
  calendar_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, google_event_base_id)
);

ALTER TABLE hidden_calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own hidden events"
  ON hidden_calendar_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own hidden events"
  ON hidden_calendar_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own hidden events"
  ON hidden_calendar_events FOR DELETE
  USING (auth.uid() = user_id);
