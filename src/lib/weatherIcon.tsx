import { Sun, CloudSun, Cloud, CloudFog, CloudRain, CloudSnow, CloudLightning, type LucideIcon } from 'lucide-react'

/** WMO weather code → lucide icon. Ranges per Open-Meteo (used by useWeather). */
export function weatherIcon(code: number): LucideIcon {
  if (code >= 95 && code < 100) return CloudLightning
  if (code >= 71 && code <= 86) return CloudSnow
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return CloudRain
  if (code >= 45 && code <= 48) return CloudFog
  if (code === 3) return Cloud
  if (code === 1 || code === 2) return CloudSun
  if (code === 0) return Sun
  return Cloud
}

/** WMO weather code → condition words ("Partly Cloudy"). */
export function weatherCondition(code: number): string {
  if (code === 0) return 'Clear'
  if (code <= 2) return 'Partly Cloudy'
  if (code === 3) return 'Cloudy'
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
