// src/hooks/usePlace.tsx
//
// The place-theme engine. Holds the active place (see src/config/places.ts),
// mirrors it onto <html data-place> so the [data-place] CSS overrides apply
// instantly (no reload), and persists it two ways: localStorage for instant
// startup, user_profiles.place_theme so the choice follows the user across
// devices (and each household member keeps their own).
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'
import { supabase, getAuthUser } from '@/lib/supabase'
import { DEFAULT_PLACE, isPlaceId, type PlaceId } from '@/config/places'

const STORAGE_KEY = 'symphony-place'

function applyToDocument(place: PlaceId) {
  if (typeof document === 'undefined') return
  if (place === DEFAULT_PLACE) delete document.documentElement.dataset.place
  else document.documentElement.dataset.place = place
}

interface PlaceContextType {
  place: PlaceId
  setPlace: (place: PlaceId) => void
}

const PlaceContext = createContext<PlaceContextType | undefined>(undefined)

export function PlaceProvider({ children }: { children: ReactNode }) {
  const [place, setPlaceState] = useState<PlaceId>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    return isPlaceId(saved) ? saved : DEFAULT_PLACE
  })

  useEffect(() => {
    applyToDocument(place)
    localStorage.setItem(STORAGE_KEY, place)
  }, [place])

  // One fetch on mount: the synced choice wins over the local cache.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data: { user } } = await getAuthUser()
        if (!user || cancelled) return
        const { data } = await supabase
          .from('user_profiles')
          .select('place_theme')
          .eq('user_id', user.id)
          .maybeSingle()
        if (cancelled) return
        // Note: setPlaceState (not setPlace) — applying the DB's own value
        // must not write back to the DB.
        const remote = (data as { place_theme?: string } | null)?.place_theme
        if (isPlaceId(remote)) setPlaceState(remote)
      } catch {
        // Offline or unauthenticated — the local cache already applied.
      }
    })()
    return () => { cancelled = true }
  }, [])

  const setPlace = useCallback((next: PlaceId) => {
    setPlaceState(next)
    ;(async () => {
      try {
        const { data: { user } } = await getAuthUser()
        if (!user) return
        await supabase
          .from('user_profiles')
          .upsert({ user_id: user.id, place_theme: next }, { onConflict: 'user_id' })
      } catch {
        // Local apply already happened; the DB catches up next time.
      }
    })()
  }, [])

  return (
    <PlaceContext.Provider value={{ place, setPlace }}>
      {children}
    </PlaceContext.Provider>
  )
}

export function usePlace() {
  const context = useContext(PlaceContext)
  if (!context) throw new Error('usePlace must be used within PlaceProvider')
  return context
}

/** The active place, or the default when no provider is mounted.
 *  For DECORATIVE consumers only (medallions, washes): a surface that renders
 *  bare — in a test, or in a subtree outside PlaceProvider — should quietly
 *  wear the default place, never throw. Anything that WRITES the place must
 *  use usePlace() and be inside the provider. */
export function usePlaceOrDefault(): PlaceId {
  return useContext(PlaceContext)?.place ?? DEFAULT_PLACE
}
