/**
 * Resolve a typed place ("Baltimore", "21211", "Portland, OR", or a street
 * address) to coordinates.
 *
 * Uses Open-Meteo's free geocoding API: no key, CORS-enabled, accepts place
 * names and postal codes. Same provider as the weather feed, so a location
 * that resolves here always has a forecast. It does not understand street
 * addresses, so those fall back to their ZIP or trailing "City, State".
 */
export interface GeocodedPlace {
  lat: number
  lng: number
  /** Human label, e.g. "Baltimore, Maryland". */
  label: string
}

const ENDPOINT = 'https://geocoding-api.open-meteo.com/v1/search'

const US_STATES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky',
  LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota',
  OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
  WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
}

/** "Portland, OR" → { name: "Portland", region: "Oregon" }; anything else passes through. */
export function splitRegion(candidate: string): { name: string; region: string | null } {
  const m = candidate.match(/^(.+?),\s*([A-Za-z]{2})$/)
  if (m) {
    const region = US_STATES[m[2].toUpperCase()]
    if (region) return { name: m[1].trim(), region }
  }
  const parts = candidate.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length === 2) return { name: parts[0], region: parts[1] }
  return { name: candidate, region: null }
}

/** Search strings to try, most specific first. */
export function geocodeCandidates(query: string): string[] {
  const q = query.trim().replace(/\s+/g, ' ')
  if (!q) return []
  const out: string[] = [q]
  const zip = q.match(/\b\d{5}\b/)
  if (zip) out.push(zip[0])
  const parts = q.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length >= 2) {
    // "…, Baltimore, MD 21211" → "Baltimore, MD" → "Baltimore"
    const tail = parts.slice(-2).map((p) => p.replace(/\b\d{5}(-\d{4})?\b/, '').trim()).filter(Boolean)
    if (tail.length === 2) out.push(tail.join(', '))
    out.push(tail[0])
  }
  return Array.from(new Set(out.filter((c) => c.length >= 2)))
}

interface Hit { name?: string; admin1?: string; latitude?: number; longitude?: number }

// Open-Meteo matches on the place name only ("Baltimore, MD" returns nothing),
// so search the name and pick the result in the named state when one is given.
async function lookup(candidate: string): Promise<GeocodedPlace | null> {
  const { name, region } = splitRegion(candidate)
  const url = `${ENDPOINT}?name=${encodeURIComponent(name)}&count=${region ? 10 : 1}&language=en&format=json`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`geocode ${res.status}`)
  const data = await res.json()
  const hits: Hit[] = Array.isArray(data?.results) ? data.results : []
  const usable = hits.filter((h) => typeof h.latitude === 'number' && typeof h.longitude === 'number')
  const hit = region
    ? usable.find((h) => (h.admin1 ?? '').toLowerCase() === region.toLowerCase()) ?? null
    : usable[0] ?? null
  if (!hit) return null
  const parts = [hit.name, hit.admin1].filter((p): p is string => typeof p === 'string' && p.length > 0)
  return { lat: hit.latitude!, lng: hit.longitude!, label: parts.join(', ') }
}

export async function geocodePlace(query: string): Promise<GeocodedPlace | null> {
  for (const candidate of geocodeCandidates(query)) {
    const hit = await lookup(candidate)
    if (hit) return hit
  }
  return null
}
