/**
 * The user's home address — the origin every travel-time estimate measures
 * from.
 *
 * Settings writes it to BOTH localStorage (shared with DirectionsBuilder) and
 * `user_profiles.home_location`. Reading prefers storage because it is
 * synchronous and always right on the device that set it; the profile is the
 * fallback that lets a second device (or the kitchen wall) show travel times
 * without anyone re-entering the address there.
 */
import { supabase, getAuthUser } from '@/lib/supabase'

export interface HomeLocation {
  address: string
  placeId?: string
}

const STORAGE_KEY = 'symphony_home_location'

let pending: Promise<HomeLocation | null> | null = null
let resolved: HomeLocation | null | undefined

/** Synchronous read of the locally saved home address. */
export function readStoredHomeLocation(): HomeLocation | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { address?: string; placeId?: string }
    const address = parsed.address?.trim()
    return address ? { address, placeId: parsed.placeId } : null
  } catch {
    return null
  }
}

/** Forget the memoized profile lookup. Tests, and after Settings saves. */
export function resetHomeLocationCache(): void {
  pending = null
  resolved = undefined
}

/**
 * Home address from storage, else from the signed-in user's profile. The
 * profile lookup is memoized so a screen full of rows makes one query.
 */
export async function getHomeLocation(): Promise<HomeLocation | null> {
  const stored = readStoredHomeLocation()
  if (stored) return stored

  if (resolved !== undefined) return resolved
  if (pending) return pending

  pending = (async (): Promise<HomeLocation | null> => {
    try {
      const { data: auth } = await getAuthUser()
      if (!auth.user) return null

      const { data } = await supabase
        .from('user_profiles')
        .select('home_location, home_place_id')
        .eq('user_id', auth.user.id)
        .maybeSingle()

      const address = (data as { home_location?: string } | null)?.home_location?.trim()
      if (!address) return null
      return { address, placeId: (data as { home_place_id?: string }).home_place_id ?? undefined }
    } catch {
      return null
    }
  })()
    .then((value) => {
      resolved = value
      return value
    })
    .finally(() => {
      pending = null
    })

  return pending
}
