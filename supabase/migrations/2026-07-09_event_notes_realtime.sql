-- event_notes was never in the realtime publication, so cross-window updates
-- to context overrides / assignees / shared-with-family silently never arrived.
-- Applied to prod via Management API 2026-07-09.
alter publication supabase_realtime add table event_notes;
