-- Add home location fields to user_profiles table
-- Enables system-wide features: climate comparison, trip defaults, time zones, "near me" filters

-- Add home location fields
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS home_location TEXT,
  ADD COLUMN IF NOT EXISTS home_lat DECIMAL(10, 8),
  ADD COLUMN IF NOT EXISTS home_lng DECIMAL(11, 8),
  ADD COLUMN IF NOT EXISTS home_place_id TEXT,
  ADD COLUMN IF NOT EXISTS home_timezone TEXT;

-- Add index for location lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_home_location
  ON user_profiles(home_location);

-- Add comments for documentation
COMMENT ON COLUMN user_profiles.home_location IS 'Display name of home location (e.g., "Chicago, IL")';
COMMENT ON COLUMN user_profiles.home_lat IS 'Latitude of home location for weather and distance calculations';
COMMENT ON COLUMN user_profiles.home_lng IS 'Longitude of home location for weather and distance calculations';
COMMENT ON COLUMN user_profiles.home_place_id IS 'Google Places ID for consistency across lookups';
COMMENT ON COLUMN user_profiles.home_timezone IS 'Auto-detected timezone for scheduling features';
