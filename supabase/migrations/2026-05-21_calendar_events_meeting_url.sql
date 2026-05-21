-- Add meeting_url column so the calendar_events cache can store the
-- video join URL extracted from Google's hangoutLink or
-- conferenceData.entryPoints[].uri. The google-calendar-events edge
-- function writes this on every refresh; the column is nullable because
-- non-video events (e.g. dentist appointments) have no meeting URL.
alter table calendar_events
  add column if not exists meeting_url text;
