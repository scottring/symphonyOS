import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

export interface WeatherData {
  currentTemp: number
  weatherCode: number
  condition: string
  highTemp: number
  lowTemp: number
  hourlyForecast: { hour: number; temp: number; code: number }[]
}

const REFRESH_INTERVAL = 30 * 60 * 1000 // 30 minutes
const COORDS_CACHE_KEY = 'symphony-weather-coords'

function getCachedCoords(): { lat: number; lng: number } | null {
  try {
    const raw = localStorage.getItem(COORDS_CACHE_KEY)
    if (!raw) return null
    const { lat, lng } = JSON.parse(raw)
    if (typeof lat === 'number' && typeof lng === 'number') return { lat, lng }
  } catch { /* ignore */ }
  return null
}

function cacheCoords(lat: number, lng: number) {
  try {
    localStorage.setItem(COORDS_CACHE_KEY, JSON.stringify({ lat, lng }))
  } catch { /* ignore */ }
}

/**
 * Pin the weather location for this browser (first-run setup, Settings).
 * Drops the last reading so the next fetch is for the new place rather than
 * showing a stale forecast for wherever the browser resolved to before.
 */
export function setHomeCoords(lat: number, lng: number) {
  cacheCoords(lat, lng)
  try { localStorage.removeItem(WEATHER_CACHE_KEY) } catch { /* ignore */ }
}

const WEATHER_CACHE_KEY = 'symphony-weather-last'
// How stale a cached reading may be before we stop showing it as a fallback.
const WEATHER_MAX_AGE_MS = 12 * 60 * 60 * 1000 // 12 hours

// Last successful reading, shown (slightly stale) when a live fetch fails — e.g.
// the provider is down — so the chip doesn't go blank. Discarded past 12h.
function getCachedWeather(): WeatherData | null {
  try {
    const raw = localStorage.getItem(WEATHER_CACHE_KEY)
    if (!raw) return null
    const { data, cachedAt } = JSON.parse(raw)
    if (typeof cachedAt !== 'number' || Date.now() - cachedAt > WEATHER_MAX_AGE_MS) return null
    if (data && typeof data.currentTemp === 'number') return data as WeatherData
  } catch { /* ignore */ }
  return null
}

function cacheWeather(data: WeatherData) {
  try {
    localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({ data, cachedAt: Date.now() }))
  } catch { /* ignore */ }
}

// WMO Weather Code → human-readable condition
function getCondition(code: number): string {
  if (code === 0) return 'Clear'
  if (code <= 3) return 'Partly Cloudy'
  if (code <= 48) return 'Foggy'
  if (code <= 55) return 'Drizzle'
  if (code <= 57) return 'Freezing Drizzle'
  if (code <= 65) return 'Rain'
  if (code <= 67) return 'Freezing Rain'
  if (code <= 75) return 'Snow'
  if (code <= 77) return 'Snow Grains'
  if (code <= 82) return 'Showers'
  if (code <= 86) return 'Snow Showers'
  if (code === 95) return 'Thunderstorm'
  if (code <= 99) return 'Thunderstorm + Hail'
  return 'Unknown'
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms)),
  ])
}

function getCoordinatesFromBrowser(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      { timeout: 10000, maximumAge: 300000 }
    )
  })
}

const SUPABASE_URL = 'https://mwadppyrqzuzgstmwpuy.supabase.co'

// Raw Open-Meteo forecast. Primary path is the Supabase proxy (the kiosk browser
// blocks direct open-meteo calls); if the proxy fails — e.g. the edge function's
// outbound TLS to open-meteo is down — fall back to calling open-meteo directly,
// which works in a normal browser. Both return identical Open-Meteo JSON.
async function fetchOpenMeteo(lat: number, lng: number) {
  const params =
    `latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,weather_code&hourly=temperature_2m,weather_code` +
    `&daily=temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit` +
    `&timezone=auto&forecast_hours=8&forecast_days=1`

  // 1) Supabase proxy
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/fetch-weather`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lng }),
    })
    if (res.ok) {
      const data = await res.json()
      if (data && !data.error && data.current) return data
    }
  } catch { /* proxy unreachable — fall back to direct */ }

  // 2) Direct open-meteo (normal browsers; proxy covers the kiosk)
  const direct = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
  if (!direct.ok) throw new Error(`open-meteo ${direct.status}`)
  return direct.json()
}

async function fetchWeatherData(lat: number, lng: number): Promise<WeatherData> {
  const data = await fetchOpenMeteo(lat, lng)
  const currentHour = new Date().getHours()
  const hourlyForecast = (data.hourly?.time || [])
    .map((t: string, i: number) => ({
      hour: new Date(t).getHours(),
      temp: Math.round(data.hourly.temperature_2m[i]),
      code: data.hourly.weather_code[i],
    }))
    .filter((h: { hour: number }) => h.hour >= currentHour)
    .slice(0, 6)

  return {
    currentTemp: Math.round(data.current.temperature_2m),
    weatherCode: data.current.weather_code,
    condition: getCondition(data.current.weather_code),
    highTemp: Math.round(data.daily.temperature_2m_max[0]),
    lowTemp: Math.round(data.daily.temperature_2m_min[0]),
    hourlyForecast,
  }
}

export function useWeather() {
  const { user } = useAuth()
  // Seed from the last-known reading so the chip shows immediately (and never
  // blanks on a failed refresh while a usable cached value exists).
  const [weather, setWeather] = useState<WeatherData | null>(getCachedWeather)
  const [loading, setLoading] = useState(() => getCachedWeather() === null)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)
  const coordsRef = useRef<{ lat: number; lng: number } | null>(null)
  const retryCountRef = useRef(0)

  const fetchWeather = useCallback(async () => {
    console.log('[weather] fetchWeather called, user:', !!user, 'cachedCoords:', !!coordsRef.current)

    // If we already resolved coordinates, reuse them
    if (coordsRef.current) {
      try {
        const data = await withTimeout(fetchWeatherData(coordsRef.current.lat, coordsRef.current.lng), 10000)
        if (mountedRef.current) {
          setWeather(data)
          cacheWeather(data)
          setError(null)
          retryCountRef.current = 0
        }
      } catch (e) {
        console.error('[weather] refetch failed:', e)
        if (mountedRef.current) {
          // Keep showing the last-known reading rather than blanking out.
          const cached = getCachedWeather()
          if (cached) { setWeather(cached); setError(null) }
          else setError(`refetch: ${e instanceof Error ? e.message : String(e)}`)
        }
      } finally {
        if (mountedRef.current) setLoading(false)
      }
      return
    }

    // Resolve coordinates through fallback chain (each step has a timeout)
    let coords: { lat: number; lng: number } | null = null
    let coordSource = 'none'

    // 0. Try localStorage cache
    coords = getCachedCoords()
    if (coords) coordSource = 'cache'

    // 1. Try Supabase user_profiles (only if user is available, 5s timeout)
    if (!coords && user) {
      try {
        const { data: profile } = await withTimeout(
          Promise.resolve(
            supabase
              .from('user_profiles')
              .select('home_lat, home_lng')
              .eq('user_id', user.id)
              .maybeSingle()
          ),
          5000
        )
        if (profile?.home_lat && profile?.home_lng) {
          coords = { lat: Number(profile.home_lat), lng: Number(profile.home_lng) }
          coordSource = 'supabase'
        }
      } catch (e) {
        console.warn('[weather] supabase coords failed:', e)
      }
    }

    // 2. Try browser geolocation (12s timeout)
    if (!coords) {
      try {
        coords = await withTimeout(getCoordinatesFromBrowser(), 12000)
        coordSource = 'geolocation'
        // Save to Supabase for next time (fire-and-forget)
        if (user) {
          supabase
            .from('user_profiles')
            .upsert({
              user_id: user.id,
              home_lat: coords.lat,
              home_lng: coords.lng,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id' })
            .then() // fire-and-forget
        }
      } catch (e) {
        console.warn('[weather] geolocation failed:', e)
      }
    }

    // 3. Try IP-based geolocation (5s timeout)
    if (!coords) {
      try {
        const ipRes = await withTimeout(fetch('https://ipapi.co/json/'), 5000)
        if (ipRes.ok) {
          const ipData = await ipRes.json()
          if (ipData.latitude && ipData.longitude) {
            coords = { lat: ipData.latitude, lng: ipData.longitude }
            coordSource = 'ip'
          }
        }
      } catch (e) {
        console.warn('[weather] IP geolocation failed:', e)
      }
    }

    // 4. Nothing resolved: show no weather rather than someone else's.
    // (A hardcoded home fell back to the founder's city for every user.)
    if (!coords) {
      console.warn('[weather] no location available')
      if (mountedRef.current) {
        setError('no-location')
        setLoading(false)
      }
      return
    }

    console.log('[weather] coords resolved via:', coordSource, coords)

    // Cache and fetch weather
    coordsRef.current = coords
    cacheCoords(coords.lat, coords.lng)
    try {
      const data = await withTimeout(fetchWeatherData(coords.lat, coords.lng), 10000)
      console.log('[weather] success:', data.currentTemp, '°F', data.condition)
      if (mountedRef.current) {
        setWeather(data)
        cacheWeather(data)
        setError(null)
        retryCountRef.current = 0
      }
    } catch (e) {
      console.error('[weather] API fetch failed:', e)
      if (mountedRef.current) {
        // Show the last-known reading (if still fresh enough) instead of blanking.
        const cached = getCachedWeather()
        if (cached) { setWeather(cached); setError(null) }
        else setError(`api: ${e instanceof Error ? e.message : String(e)} [${coordSource}]`)
        // Auto-retry up to 3 times with backoff to get a live reading
        if (retryCountRef.current < 3) {
          retryCountRef.current++
          const delay = retryCountRef.current * 5000
          console.log(`[weather] retrying in ${delay}ms (attempt ${retryCountRef.current})`)
          setTimeout(() => { if (mountedRef.current) fetchWeather() }, delay)
        }
      }
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [user])

  // Manual location setter
  const requestLocation = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const coords = await getCoordinatesFromBrowser()
      coordsRef.current = coords
      cacheCoords(coords.lat, coords.lng)

      if (user) {
        await supabase
          .from('user_profiles')
          .upsert({
            user_id: user.id,
            home_lat: coords.lat,
            home_lng: coords.lng,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' })
      }

      const data = await fetchWeatherData(coords.lat, coords.lng)
      if (mountedRef.current) {
        setWeather(data)
        cacheWeather(data)
        setError(null)
      }
    } catch {
      if (mountedRef.current) setError('no-location')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [user])

  // Run immediately on mount — don't wait for auth
  useEffect(() => {
    mountedRef.current = true
    fetchWeather()

    const interval = setInterval(fetchWeather, REFRESH_INTERVAL)
    return () => {
      mountedRef.current = false
      clearInterval(interval)
    }
  }, [fetchWeather])

  return { weather, loading, error, requestLocation }
}
