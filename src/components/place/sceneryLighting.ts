// Automatic scenery lighting: Daytime, Dusk / Dawn or Nighttime from where
// the sun is. Sunrise and sunset come from the browser's known location (the
// one the weather already resolved and cached); without it, a fixed
// 6:45 AM / 6:45 PM local day. Pure functions — the preference hook
// (useSceneryPreferences) re-reads them as the clock moves.
import type { SceneryLighting } from '@/hooks/useSceneryPreferences'

export interface Coords { lat: number; lng: number }

/** Dawn spans sunrise ± 45 min; dusk runs from an hour before sunset (the
 *  golden hour) to 30 min after it (civil twilight). */
const DAWN_BEFORE = 45 * 60_000
const DAWN_AFTER = 45 * 60_000
const DUSK_BEFORE = 60 * 60_000
const DUSK_AFTER = 30 * 60_000
/** Without a location: sunrise and sunset at these local clock times. */
const FALLBACK_RISE = [6, 45] as const
const FALLBACK_SET = [18, 45] as const

/** The weather's cached location for this browser (useWeather.ts writes it). */
export const WEATHER_COORDS_KEY = 'symphony-weather-coords'

export function readCachedCoords(): Coords | null {
  try {
    const raw = localStorage.getItem(WEATHER_COORDS_KEY)
    if (!raw) return null
    const { lat, lng } = JSON.parse(raw)
    if (typeof lat === 'number' && typeof lng === 'number') return { lat, lng }
  } catch { /* unavailable or malformed: fall back to clock times */ }
  return null
}

// Sunrise/sunset (standard −0.833° horizon), after the NOAA / SunCalc method.
const RAD = Math.PI / 180
const DAY_MS = 86_400_000
const J1970 = 2440588
const J2000 = 2451545
const J0 = 0.0009
const OBLIQUITY = RAD * 23.4397

const toDays = (ms: number) => ms / DAY_MS - 0.5 + J1970 - J2000
const fromJulian = (j: number) => (j + 0.5 - J1970) * DAY_MS
const meanAnomaly = (d: number) => RAD * (357.5291 + 0.98560028 * d)
const eclipticLongitude = (m: number) =>
  m + RAD * (1.9148 * Math.sin(m) + 0.02 * Math.sin(2 * m) + 0.0003 * Math.sin(3 * m)) + RAD * 102.9372 + Math.PI

/** Sunrise and sunset (epoch ms) of the solar day nearest `ms`, or null in a
 *  polar day or night. */
export function sunTimes(ms: number, { lat, lng }: Coords): { rise: number; set: number } | null {
  const lw = RAD * -lng
  const phi = RAD * lat
  const n = Math.round(toDays(ms) - J0 - lw / (2 * Math.PI))
  const ds = J0 + lw / (2 * Math.PI) + n
  const m = meanAnomaly(ds)
  const l = eclipticLongitude(m)
  const dec = Math.asin(Math.sin(OBLIQUITY) * Math.sin(l))
  const noon = J2000 + ds + 0.0053 * Math.sin(m) - 0.0069 * Math.sin(2 * l)
  const cosW = (Math.sin(RAD * -0.833) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec))
  if (!(cosW >= -1 && cosW <= 1)) return null
  const w = Math.acos(cosW)
  const set = J2000 + J0 + (w + lw) / (2 * Math.PI) + n + 0.0053 * Math.sin(m) - 0.0069 * Math.sin(2 * l)
  return { rise: fromJulian(noon - (set - noon)), set: fromJulian(set) }
}

function fallbackTimes(ms: number): { rise: number; set: number } {
  const day = new Date(ms)
  const at = ([h, min]: readonly [number, number]) =>
    new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, min).getTime()
  return { rise: at(FALLBACK_RISE), set: at(FALLBACK_SET) }
}

/** The lighting windows of the day around `ms`, in order: [start, lighting]. */
function windows(ms: number, coords: Coords | null): [number, SceneryLighting][] {
  const out: [number, SceneryLighting][] = []
  for (const offset of [-DAY_MS, 0, DAY_MS]) {
    const t = ms + offset
    const sun = coords ? sunTimes(t, coords) : fallbackTimes(t)
    if (!sun) {
      // Polar day or night: noon decides, all day long.
      const midnight = new Date(t); midnight.setHours(0, 0, 0, 0)
      const noonSun = coords ? sunAltitudeAtNoon(t, coords) : 1
      out.push([midnight.getTime(), noonSun > 0 ? 'daytime' : 'nighttime'])
      continue
    }
    out.push(
      [sun.rise - DAWN_BEFORE, 'dusk-dawn'],
      [sun.rise + DAWN_AFTER, 'daytime'],
      [sun.set - DUSK_BEFORE, 'dusk-dawn'],
      [sun.set + DUSK_AFTER, 'nighttime'],
    )
  }
  return out.sort((a, b) => a[0] - b[0])
}

function sunAltitudeAtNoon(ms: number, { lat }: Coords): number {
  const m = meanAnomaly(toDays(ms))
  const dec = Math.asin(Math.sin(OBLIQUITY) * Math.sin(eclipticLongitude(m)))
  return 90 - Math.abs(lat - dec / RAD)
}

/** The lighting at `ms`, and when it next changes (epoch ms). */
export function lightingAt(ms: number, coords: Coords | null): { lighting: SceneryLighting; next: number | null } {
  const list = windows(ms, coords)
  let lighting: SceneryLighting = 'nighttime'
  let next: number | null = null
  for (const [start, value] of list) {
    if (start <= ms) lighting = value
    else if (value !== lighting) { next = start; break }
  }
  return { lighting, next }
}
