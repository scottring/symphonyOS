/**
 * User Profile Types
 *
 * Extends the basic auth user with application-specific profile data.
 * Home location fields enable system-wide features across Relish.
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

  // Relish onboarding (family coherence system)
  relish_onboarding_phases_completed?: string[]
  relish_current_phase?: string | null
  family_manual_id?: string | null
  relish_intro_completed?: boolean

  // Personal wellness (per-adult, feeds daily script coaching)
  personal_wellness?: PersonalWellness | null

  created_at: string
  updated_at: string
}

/**
 * Personal wellness profile — filled by each adult during onboarding.
 * Drives the daily script's personal coaching (exercise, eating, sleep, stress).
 */
export interface PersonalWellness {
  exercise: {
    goals: string
    current_habits: string
    preferred_activities: string[]
    schedule: string
  }
  nutrition: {
    goals: string
    restrictions: string[]
    current_habits: string
    meal_preferences: string
  }
  sleep: {
    target_bedtime: string
    target_waketime: string
    current_patterns: string
    challenges: string
  }
  stress: {
    triggers: string[]
    coping_strategies: string[]
    warning_signs: string
  }
  growth: {
    priorities: string[]
    hobbies: string[]
    reading: string
    learning_goals: string
  }
  assessed_at: string
}

/**
 * Child profile — filled by parents about each child during onboarding.
 * Stored on the family_members record for children.
 * Drives age-adapted daily scripts and helps the AI understand each child.
 */
export interface ChildProfile {
  developmental_needs: string
  academic_focus: string[]
  social_needs: string
  physical_activity: string[]
  screen_boundaries: string
  emotional_patterns: string
  routines_that_work: string[]
  routines_that_dont: string[]
  special_interests: string[]
  challenges: string[]
  parent_notes: string
  assessed_at: string
  assessed_by: string[]
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
