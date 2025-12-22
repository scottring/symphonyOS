-- Migration: Add trip planning support to projects
-- Adds trip_metadata JSONB column and type field to projects table

-- Add type column to projects (general or trip)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'general';

-- Add trip_metadata JSONB column for trip-specific data
ALTER TABLE projects ADD COLUMN IF NOT EXISTS trip_metadata JSONB;

-- Add index on type for efficient filtering of trip projects
CREATE INDEX IF NOT EXISTS idx_projects_type ON projects(type);

-- Add index on trip_metadata for GIN queries (useful for searching within JSONB)
CREATE INDEX IF NOT EXISTS idx_projects_trip_metadata ON projects USING GIN (trip_metadata);

-- Add comment explaining the trip_metadata structure
COMMENT ON COLUMN projects.trip_metadata IS 'JSONB column containing trip planning data: {startDate, endDate, origin, destination, travelMode, vehicleModel, rangePerCharge, currentBattery, preferredNetworks}';
