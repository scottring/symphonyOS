/**
 * Travel-time estimates for items that carry a physical address.
 *
 * Google is called SERVER-SIDE, through the same 'places-proxy' edge function
 * the autocomplete uses: direct browser calls to googleapis.com die on some
 * devices/networks (content blockers, Private Relay, DNS filters), and the
 * Maps JS DirectionsService inside DirectionsBuilder inherits that fragility.
 * A chip on every row has to be more reliable than that.
 *
 * The estimate is deliberately TRAFFIC-FREE — "how far away is this place",
 * not "leave in 4 minutes". That makes it cacheable for a long time, so a
 * recurring address (school, the gym) costs one API call rather than one per
 * render, which is what keeps this affordable.
 */
import { supabase } from '@/lib/supabase'
import { locationLink } from '@/lib/locationLink'
import type { TravelMode } from '@/types/directions'

export interface TravelEstimate {
  durationSeconds: number
  distanceMeters: number
}

interface TravelRequest {
  origin: string
  originPlaceId?: string
  destination: string
  destinationPlaceId?: string
  mode: TravelMode
}

const CACHE_PREFIX = 'symphony_travel_v1:'
/** A static estimate between two fixed points barely moves; a month is safe. */
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000
/** After a failure (API blocked, offline), stop asking for a while. */
const BACKOFF_MS = 10 * 60 * 1000

let backoffUntil = 0
const inFlight = new Map<string, Promise<TravelEstimate | null>>()

/** Storage key for one origin→destination pair. Exported for tests. */
export function travelCacheKey(origin: string, destination: string, mode: TravelMode): string {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
  return `${CACHE_PREFIX}${mode}|${norm(origin)}|${norm(destination)}`
}

/** Drop in-memory state (backoff, in-flight requests). Tests only. */
export function resetTravelCache(): void {
  backoffUntil = 0
  inFlight.clear()
}

/**
 * Is this location somewhere you actually travel to? A Zoom link or a bare
 * "Microsoft Teams Meeting" label is not — same rule locationLink applies, so
 * a video call never sprouts a drive time.
 */
export function isTravelDestination(
  location: string | null | undefined,
  placeId?: string | null,
  meetingUrl?: string | null,
): boolean {
  return locationLink(location, placeId, meetingUrl).kind === 'maps'
}

const VERB: Record<TravelMode, string> = {
  driving: 'drive',
  walking: 'walk',
  transit: 'transit',
  bicycling: 'ride',
}

/** 1080 → "18 min drive". Hours roll over; never reads "0 min". */
export function formatTravelEstimate(durationSeconds: number, mode: TravelMode): string {
  const minutes = Math.max(1, Math.round(durationSeconds / 60))
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  const time = hours === 0 ? `${minutes} min` : rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`
  return `${time} ${VERB[mode]}`
}

function readCache(key: string): TravelEstimate | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { d?: number; m?: number; t?: number }
    if (typeof parsed.d !== 'number' || typeof parsed.t !== 'number') return null
    if (Date.now() - parsed.t > CACHE_TTL_MS) {
      localStorage.removeItem(key)
      return null
    }
    return { durationSeconds: parsed.d, distanceMeters: parsed.m ?? 0 }
  } catch {
    return null
  }
}

function writeCache(key: string, estimate: TravelEstimate): void {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({ d: estimate.durationSeconds, m: estimate.distanceMeters, t: Date.now() }),
    )
  } catch {
    // Private mode / quota — the estimate still renders, it just re-fetches.
  }
}

/**
 * Travel time between two addresses, cached. Returns null (quietly) whenever
 * the answer isn't available — a missing chip is the right failure mode here.
 */
export async function getTravelEstimate(req: TravelRequest): Promise<TravelEstimate | null> {
  const origin = req.origin?.trim()
  const destination = req.destination?.trim()
  if (!origin || !destination) return null

  const key = travelCacheKey(origin, destination, req.mode)

  const cached = readCache(key)
  if (cached) return cached

  if (Date.now() < backoffUntil) return null

  const existing = inFlight.get(key)
  if (existing) return existing

  const request = (async (): Promise<TravelEstimate | null> => {
    try {
      const { data, error } = await supabase.functions.invoke<{
        durationSeconds?: number
        distanceMeters?: number
      }>('places-proxy', {
        body: {
          action: 'route',
          origin,
          originPlaceId: req.originPlaceId,
          destination,
          destinationPlaceId: req.destinationPlaceId,
          travelMode: req.mode,
        },
      })

      if (error || typeof data?.durationSeconds !== 'number') {
        backoffUntil = Date.now() + BACKOFF_MS
        return null
      }

      const estimate: TravelEstimate = {
        durationSeconds: data.durationSeconds,
        distanceMeters: data.distanceMeters ?? 0,
      }
      writeCache(key, estimate)
      return estimate
    } catch {
      backoffUntil = Date.now() + BACKOFF_MS
      return null
    } finally {
      inFlight.delete(key)
    }
  })()

  inFlight.set(key, request)
  return request
}
