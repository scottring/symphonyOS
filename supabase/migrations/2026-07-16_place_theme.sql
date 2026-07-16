-- Place themes: each user picks the illustrated "place" that skins their app
-- (sidebar medallion + accent-deep re-tint). Free text validated client-side
-- against src/config/places.ts so adding a place never needs a migration.
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS place_theme text;

COMMENT ON COLUMN user_profiles.place_theme IS
  'Place theme id (urban | small-city | mountain-town | cabin | farm); null = default (cabin)';
