-- Routines can carry a location (e.g. school pickup, gym) so the detail panel
-- offers Google Places autocomplete + directions, mirroring tasks/events.
-- Applied to prod via the Management API on 2026-06-08.

ALTER TABLE routines
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS location_place_id text;
