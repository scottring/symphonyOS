-- Migration: Remove all packing and trip phase tasks from database
-- These were part of the trip planning feature that has been removed

-- Delete all packing tasks (title starts with "Pack:")
DELETE FROM tasks
WHERE title ILIKE 'Pack:%';

-- Delete all trip phase tasks (PreTrip, Departure, Return)
DELETE FROM tasks
WHERE title ILIKE 'PreTrip:%'
   OR title ILIKE 'Departure:%'
   OR title ILIKE 'Return:%';

-- Add comment explaining the cleanup
COMMENT ON TABLE tasks IS 'User tasks - packing and trip phase tasks removed as of migration 045';
