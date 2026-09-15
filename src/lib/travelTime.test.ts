import { describe, it, expect, beforeEach, vi } from 'vitest'

const invoke = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}))

import {
  formatTravelEstimate,
  isTravelDestination,
  getTravelEstimate,
  travelCacheKey,
  resetTravelCache,
} from './travelTime'

const ok = (seconds: number, meters = 1000) => ({
  data: { durationSeconds: seconds, distanceMeters: meters },
  error: null,
})

describe('formatTravelEstimate', () => {
  it('renders minutes with the travel verb', () => {
    expect(formatTravelEstimate(1080, 'driving')).toBe('18 min drive')
    expect(formatTravelEstimate(1080, 'walking')).toBe('18 min walk')
    expect(formatTravelEstimate(1080, 'transit')).toBe('18 min transit')
  })

  it('rolls over into hours', () => {
    expect(formatTravelEstimate(3900, 'driving')).toBe('1 hr 5 min drive')
    expect(formatTravelEstimate(7200, 'driving')).toBe('2 hr drive')
  })

  it('floors at one minute so a nearby address never reads "0 min"', () => {
    expect(formatTravelEstimate(20, 'driving')).toBe('1 min drive')
  })
})

describe('isTravelDestination', () => {
  it('accepts a physical address', () => {
    expect(isTravelDestination('1400 Coppermine Terr, Baltimore MD')).toBe(true)
  })

  it('rejects meeting links and virtual labels', () => {
    expect(isTravelDestination('https://zoom.us/j/123')).toBe(false)
    expect(isTravelDestination('Microsoft Teams Meeting')).toBe(false)
  })

  it('rejects an empty location', () => {
    expect(isTravelDestination('')).toBe(false)
    expect(isTravelDestination(null)).toBe(false)
  })
})

describe('getTravelEstimate', () => {
  beforeEach(() => {
    invoke.mockReset()
    resetTravelCache()
    localStorage.clear()
  })

  const args = {
    origin: '100 Home St, Baltimore MD',
    destination: '1400 Coppermine Terr, Baltimore MD',
    mode: 'driving' as const,
  }

  it('asks the places-proxy for a route', async () => {
    invoke.mockResolvedValue(ok(1080, 7400))

    const result = await getTravelEstimate(args)

    expect(result).toEqual({ durationSeconds: 1080, distanceMeters: 7400 })
    expect(invoke).toHaveBeenCalledWith('places-proxy', {
      body: {
        action: 'route',
        origin: args.origin,
        originPlaceId: undefined,
        destination: args.destination,
        destinationPlaceId: undefined,
        travelMode: 'driving',
      },
    })
  })

  it('serves a repeat lookup from cache instead of paying for it twice', async () => {
    invoke.mockResolvedValue(ok(1080))

    await getTravelEstimate(args)
    const second = await getTravelEstimate(args)

    expect(second).toEqual({ durationSeconds: 1080, distanceMeters: 1000 })
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('reuses a cache entry written by an earlier session', async () => {
    localStorage.setItem(
      travelCacheKey(args.origin, args.destination, 'driving'),
      JSON.stringify({ d: 600, m: 3000, t: Date.now() }),
    )

    const result = await getTravelEstimate(args)

    expect(result).toEqual({ durationSeconds: 600, distanceMeters: 3000 })
    expect(invoke).not.toHaveBeenCalled()
  })

  it('makes one request when several rows ask for the same route at once', async () => {
    invoke.mockResolvedValue(ok(1080))

    const [a, b] = await Promise.all([getTravelEstimate(args), getTravelEstimate(args)])

    expect(a).toEqual(b)
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('backs off after a failure rather than retrying on every render', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'Routes API is not enabled' } })

    const first = await getTravelEstimate(args)
    const second = await getTravelEstimate({ ...args, destination: 'somewhere else' })

    expect(first).toBeNull()
    expect(second).toBeNull()
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('returns null without calling out when origin or destination is missing', async () => {
    expect(await getTravelEstimate({ ...args, origin: '' })).toBeNull()
    expect(await getTravelEstimate({ ...args, destination: '  ' })).toBeNull()
    expect(invoke).not.toHaveBeenCalled()
  })
})
