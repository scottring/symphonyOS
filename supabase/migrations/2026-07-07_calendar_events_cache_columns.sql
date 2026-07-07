-- The google-calendar-events edge function's cache upsert has failed silently
-- since 2025-12-18: the payload grew calendar_name, calendar_color,
-- recurring_event_id and attendees, but the table never got the columns, so
-- every upsert errored and the cache froze. The symphony-agent edge function
-- reads this table, so the assistant was answering from December's calendar.
ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS calendar_name text,
  ADD COLUMN IF NOT EXISTS calendar_color text,
  ADD COLUMN IF NOT EXISTS recurring_event_id text,
  ADD COLUMN IF NOT EXISTS attendees jsonb;
