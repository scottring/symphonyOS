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
