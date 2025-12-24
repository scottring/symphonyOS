/**
 * User Profile Types
 *
 * Extends the basic auth user with application-specific profile data.
 * Home location fields enable system-wide features across Symphony OS.
 */

export interface UserProfile {
  id: string
  user_id: string

  // Onboarding tracking
  onboarding_step?: string
  onboarding_completed_at?: string | null

  // Home location (system-wide features)
  home_location?: string | null
  home_lat?: number | null
  home_lng?: number | null
  home_place_id?: string | null
  home_timezone?: string | null

  created_at: string
  updated_at: string
}

/**
 * Location object structure (matches Trip Location type)
 */
export interface HomeLocation {
  name: string
  lat: number
  lng: number
  place_id?: string
  timezone?: string
}
