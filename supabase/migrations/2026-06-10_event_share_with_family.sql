-- supabase/migrations/2026-06-10_event_share_with_family.sql
-- Flags for surfacing a work/personal event on the shared family timeline.
ALTER TABLE event_notes
  ADD COLUMN IF NOT EXISTS shared_with_family boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS share_nudge_dismissed boolean NOT NULL DEFAULT false;
