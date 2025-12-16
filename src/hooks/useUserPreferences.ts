import { useState, useCallback, useEffect } from 'react'

const STORAGE_KEY = 'symphony-user-preferences'

export interface UserPreferences {
  /** Whether to auto-show the Daily Brief modal on page load */
  autoShowDailyBrief: boolean
}

const DEFAULT_PREFERENCES: UserPreferences = {
  autoShowDailyBrief: true,
}

interface UseUserPreferencesResult {
  preferences: UserPreferences
  updatePreference: <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => void
}

function loadPreferences(): UserPreferences {
  if (typeof window === 'undefined') return DEFAULT_PREFERENCES

  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      // Merge with defaults to handle new preference keys
      return { ...DEFAULT_PREFERENCES, ...parsed }
    }
  } catch (err) {
    console.error('Failed to load user preferences:', err)
  }

  return DEFAULT_PREFERENCES
}

function savePreferences(preferences: UserPreferences): void {
  if (typeof window === 'undefined') return

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
  } catch (err) {
    console.error('Failed to save user preferences:', err)
  }
}

export function useUserPreferences(): UseUserPreferencesResult {
  const [preferences, setPreferences] = useState<UserPreferences>(loadPreferences)

  const updatePreference = useCallback(<K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K]
  ) => {
    setPreferences(prev => {
      const updated = { ...prev, [key]: value }
      savePreferences(updated)
      return updated
    })
  }, [])

  // Sync with localStorage on mount and across tabs
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue)
          setPreferences({ ...DEFAULT_PREFERENCES, ...parsed })
        } catch {
          // Ignore parse errors
        }
      }
    }

    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  return {
    preferences,
    updatePreference,
  }
}
