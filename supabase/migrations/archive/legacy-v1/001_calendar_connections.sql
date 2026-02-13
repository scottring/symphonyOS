-- Calendar connections table for storing Google OAuth tokens
CREATE TABLE calendar_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'google',
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  calendar_id TEXT, -- Primary calendar to sync
  sync_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, provider)
);

-- Enable RLS
ALTER TABLE calendar_connections ENABLE ROW LEVEL SECURITY;

-- Users can only see their own connections
CREATE POLICY "Users can view own connections"
  ON calendar_connections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own connections"
  ON calendar_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own connections"
  ON calendar_connections FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own connections"
  ON calendar_connections FOR DELETE
  USING (auth.uid() = user_id);

-- Calendar events cache (imported from Google Calendar)
CREATE TABLE calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  google_event_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  all_day BOOLEAN DEFAULT false,
  location TEXT,
  calendar_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, google_event_id)
);

-- Enable RLS
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own events"
  ON calendar_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own events"
  ON calendar_events FOR ALL
  USING (auth.uid() = user_id);

-- Index for efficient date range queries
CREATE INDEX idx_calendar_events_user_time
  ON calendar_events(user_id, start_time, end_time);
