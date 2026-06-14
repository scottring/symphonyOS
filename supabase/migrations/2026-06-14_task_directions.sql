-- Persisted directions for a task: the user's chosen starting point (origin),
-- intermediate stops, and travel mode. Stored as JSONB so a route built in the
-- detail panel survives reopening and syncs across desktop/mobile. The
-- destination is derived from tasks.location, so it is NOT stored here.
--
-- Shape (TaskDirections in src/types/directions.ts):
--   { origin?: RouteStop, stops?: RouteStop[], travelMode?: 'driving'|'walking'|'transit' }
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS directions jsonb;
