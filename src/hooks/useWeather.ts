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

export function useWeather() {
  const { user } = useAuth()
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  const fetchWeather = useCallback(async () => {
    if (!user) return

    // Get home location from user_profiles
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('home_lat, home_lng')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!profile?.home_lat || !profile?.home_lng) {
      if (mountedRef.current) {
        setError('no-location')
        setLoading(false)
      }
      return
    }

    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${profile.home_lat}&longitude=${profile.home_lng}&current=temperature_2m,weather_code&hourly=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&timezone=auto&forecast_hours=8&forecast_days=1`

      const res = await fetch(url)
      if (!res.ok) throw new Error('Weather API error')

      const data = await res.json()

      if (!mountedRef.current) return

      const currentHour = new Date().getHours()
      const hourlyForecast = (data.hourly?.time || [])
        .map((t: string, i: number) => ({
          hour: new Date(t).getHours(),
          temp: Math.round(data.hourly.temperature_2m[i]),
          code: data.hourly.weather_code[i],
        }))
        .filter((h: { hour: number }) => h.hour >= currentHour)
        .slice(0, 6)

      setWeather({
        currentTemp: Math.round(data.current.temperature_2m),
        weatherCode: data.current.weather_code,
        condition: getCondition(data.current.weather_code),
        highTemp: Math.round(data.daily.temperature_2m_max[0]),
        lowTemp: Math.round(data.daily.temperature_2m_min[0]),
        hourlyForecast,
      })
      setError(null)
    } catch {
      if (mountedRef.current) {
        setError('fetch-error')
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }, [user])

  useEffect(() => {
    mountedRef.current = true
    fetchWeather()

    const interval = setInterval(fetchWeather, REFRESH_INTERVAL)
    return () => {
      mountedRef.current = false
      clearInterval(interval)
    }
  }, [fetchWeather])

  return { weather, loading, error }
}
