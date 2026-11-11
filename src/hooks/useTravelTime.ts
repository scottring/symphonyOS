import { useEffect, useState } from 'react'
import { getHomeLocation } from '@/lib/homeLocation'
import { formatTravelDuration, formatTravelEstimate, getTravelEstimate, isTravelDestination } from '@/lib/travelTime'
import { routeMode, type TravelChoice } from '@/lib/travelChoice'
import type { TravelMode } from '@/types/directions'

interface TravelTimeTarget {
  location?: string | null
  locationPlaceId?: string | null
  /** Google sometimes keeps a Teams/Meet join link here, not in `location`. */
  meetingUrl?: string | null
}

interface TravelTimeOptions {
  /** Skip the lookup entirely (row not visible, feature off). */
  enabled?: boolean
  /** How you're getting there; Uber ('rideshare') is timed as a drive. */
  mode?: TravelMode | TravelChoice
}

const sameAddress = (a: string, b: string) =>
  a.trim().toLowerCase().replace(/\s+/g, ' ') === b.trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * "18 min drive" for an item with a real address, or null — null whenever the
 * location is virtual, no home address is set, the item is at home, or the
 * estimate simply isn't available. Callers render the label when it exists and
 * show nothing when it doesn't; there is no error state to surface.
 */
export function useTravelTime(
  target: TravelTimeTarget,
  { enabled = true, mode = 'driving' }: TravelTimeOptions = {},
): string | null {
  const [label, setLabel] = useState<string | null>(null)
  const { location, locationPlaceId, meetingUrl } = target

  useEffect(() => {
    if (!enabled || !isTravelDestination(location, locationPlaceId, meetingUrl)) {
      setLabel(null)
      return
    }

    let cancelled = false
    const destination = (location ?? '').trim()

    void (async () => {
      const home = await getHomeLocation()
      if (cancelled || !home) {
        if (!cancelled) setLabel(null)
        return
      }
      // Nothing useful to say about travelling to where you already are.
      if (sameAddress(home.address, destination)) {
        setLabel(null)
        return
      }

      const estimate = await getTravelEstimate({
        origin: home.address,
        originPlaceId: home.placeId,
        destination,
        destinationPlaceId: locationPlaceId ?? undefined,
        mode: routeMode(mode),
      })
      if (cancelled) return
      setLabel(!estimate ? null
        : mode === 'rideshare' ? `${formatTravelDuration(estimate.durationSeconds)} by Uber`
          : formatTravelEstimate(estimate.durationSeconds, mode))
    })()

    return () => {
      cancelled = true
    }
  }, [enabled, location, locationPlaceId, meetingUrl, mode])

  return label
}
