import type { WeatherData } from '@/hooks/useWeather'

/**
 * The words for Today's weather line. Pure, so the masthead stays a renderer.
 *
 * The line is: temperature, condition, the day's high and low, and — only
 * when the next few hours change the picture — one precipitation cue
 * ("Rain from 3 PM", "Clearing by 2 PM"). A dry day says nothing about rain.
 */

type Wet = 'Rain' | 'Snow' | 'Storms'

/** WMO code → the kind of wet it is, or null for a dry sky. Open-Meteo ranges. */
export function wetKind(code: number): Wet | null {
  if (code >= 95 && code <= 99) return 'Storms'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'Snow'
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'Rain'
  return null
}

function hourLabel(hour: number): string {
  if (hour === 0) return '12 AM'
  if (hour === 12) return '12 PM'
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`
}

/**
 * One cue for the hours ahead, or null. Hours already past are ignored, so a
 * cached reading (kept up to 12h as a fallback) never announces rain "from"
 * an hour that has gone.
 */
export function precipCue(weather: WeatherData, now: Date): string | null {
  const ahead = (weather.hourlyForecast ?? []).filter((h) => h.hour > now.getHours())
  const wetNow = wetKind(weather.weatherCode)
  if (!wetNow) {
    const next = ahead.find((h) => wetKind(h.code))
    return next ? `${wetKind(next.code)} from ${hourLabel(next.hour)}` : null
  }
  // Already wet: the condition says so. Only worth a word if it lets up soon.
  const dry = ahead.find((h) => !wetKind(h.code))
  return dry ? `Clearing by ${hourLabel(dry.hour)}` : null
}

/** "Partly Cloudy" → "Partly cloudy": the line is a sentence, not a label. */
export function conditionWords(condition: string): string {
  if (!condition || condition === 'Unknown') return ''
  return condition.charAt(0) + condition.slice(1).toLowerCase()
}
