import { describe, it, expect, afterEach } from 'vitest'
import { lightingAt, readCachedCoords, sunTimes, WEATHER_COORDS_KEY } from './sceneryLighting'

// Baltimore on 2026-10-01: sunrise ≈ 7:05 AM EDT (11:05 UTC), sunset ≈ 6:51 PM
// EDT (22:51 UTC). Times below are UTC instants so the test is TZ-proof.
const BALTIMORE = { lat: 39.29, lng: -76.61 }
const utc = (h: number, m = 0) => Date.UTC(2026, 9, 1, h, m)
const minutes = (ms: number) => Math.round(ms / 60_000)

describe('automatic scenery lighting', () => {
  afterEach(() => localStorage.removeItem(WEATHER_COORDS_KEY))

  it('finds sunrise and sunset for a known place and day', () => {
    const sun = sunTimes(utc(16), BALTIMORE)!
    expect(Math.abs(minutes(sun.rise - utc(11, 5)))).toBeLessThanOrEqual(4)
    expect(Math.abs(minutes(sun.set - utc(22, 51)))).toBeLessThanOrEqual(4)
  })

  it('moves from night to dawn, day, dusk and back to night', () => {
    expect(lightingAt(utc(9), BALTIMORE).lighting).toBe('nighttime')        // 5 AM
    expect(lightingAt(utc(11), BALTIMORE).lighting).toBe('dusk-dawn')       // 7 AM, sunrise
    expect(lightingAt(utc(16), BALTIMORE).lighting).toBe('daytime')         // noon
    expect(lightingAt(utc(22, 20), BALTIMORE).lighting).toBe('dusk-dawn')  // 6:20 PM, golden hour
    expect(lightingAt(utc(23, 40), BALTIMORE).lighting).toBe('nighttime')  // 7:40 PM
  })

  it('says when the lighting next changes', () => {
    const { lighting, next } = lightingAt(utc(16), BALTIMORE)
    expect(lighting).toBe('daytime')
    // Dusk starts an hour before sunset.
    expect(Math.abs(minutes(next! - utc(21, 51)))).toBeLessThanOrEqual(4)
  })

  it('falls back to a 6:45 to 6:45 local day without a location', () => {
    const local = (h: number, m = 0) => new Date(2026, 9, 1, h, m).getTime()
    expect(lightingAt(local(5), null).lighting).toBe('nighttime')
    expect(lightingAt(local(6, 30), null).lighting).toBe('dusk-dawn')
    expect(lightingAt(local(12), null).lighting).toBe('daytime')
    expect(lightingAt(local(18, 30), null).lighting).toBe('dusk-dawn')
    expect(lightingAt(local(21), null).lighting).toBe('nighttime')
  })

  it('handles polar day and night without throwing', () => {
    const svalbard = { lat: 78.2, lng: 15.6 }
    expect(lightingAt(Date.UTC(2026, 5, 21, 0), svalbard).lighting).toBe('daytime')
    expect(lightingAt(Date.UTC(2026, 11, 21, 12), svalbard).lighting).toBe('nighttime')
  })

  it("reads the weather's cached location, ignoring junk", () => {
    expect(readCachedCoords()).toBeNull()
    localStorage.setItem(WEATHER_COORDS_KEY, JSON.stringify(BALTIMORE))
    expect(readCachedCoords()).toEqual(BALTIMORE)
    localStorage.setItem(WEATHER_COORDS_KEY, '{oops')
    expect(readCachedCoords()).toBeNull()
  })
})
