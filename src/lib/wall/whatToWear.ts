// One line a kid can act on before the walk to school: raincoat, coat,
// jacket, or shorts. From the day's high and the morning's sky, not the
// current reading — at 6:50am the current temperature is the day's low and
// would put every September child in a winter coat.
import type { WeatherData } from '@/hooks/useWeather'

export interface WearLine {
  /** "Raincoat" */
  wear: string
  /** "Rain this morning · high 64°" */
  why: string
}

// WMO weather interpretation codes, as Open-Meteo reports them.
const isWet = (code: number) =>
  (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95
const isSnow = (code: number) => (code >= 71 && code <= 77) || code === 85 || code === 86

export function whatToWear(weather: WeatherData | null | undefined, now: Date): WearLine | null {
  if (!weather) return null
  const high = weather.highTemp
  // The school day's sky: 7am to 6pm from the hourly forecast, or the
  // current code when that is all there is.
  const hours = weather.hourlyForecast?.filter((h) => h.hour >= 7 && h.hour <= 18) ?? []
  const codes = hours.length ? hours.map((h) => h.code) : [weather.weatherCode]
  const wet = codes.some(isWet)
  const snow = codes.some(isSnow)
  const deg = `high ${Math.round(high)}°`

  if (snow) return { wear: 'Snow boots and a warm coat', why: `Snow today · ${deg}` }
  if (high < 40) return { wear: 'Winter coat, hat and gloves', why: `Cold · ${deg}` }
  if (wet && high < 58) return { wear: 'Raincoat over a warm layer', why: `Rain and cool · ${deg}` }
  if (wet) return { wear: 'Raincoat', why: `Rain today · ${deg}` }
  if (high < 58) return { wear: 'Warm jacket', why: `Chilly · ${deg}` }
  if (high < 70) return { wear: 'Light jacket or hoodie', why: `Cool · ${deg}` }
  void now
  return { wear: 'Shorts weather', why: `Warm · ${deg}` }
}
