import { createElement, useEffect, useRef, useState } from 'react'
import { useWeather } from '@/hooks/useWeather'
import { weatherIcon } from '@/lib/weatherIcon'
import { conditionWords, precipCue } from '@/lib/today/weatherLine'

/**
 * Today's weather, as one quiet line in the masthead's ear:
 *
 *   [icon] 63°  Clear · 78° / 58° · Rain from 3 PM
 *
 * Plain text in the journal's grammar — no chip, no tint. The rain cue only
 * appears when the next few hours change the picture. Renders nothing while
 * loading, on error, or with no location: an absent line is calmer than a
 * placeholder. Tapping it opens the next few hours.
 */
export function WeatherChip({ now = new Date() }: { now?: Date }) {
  const { weather, loading, error } = useWeather()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  if (loading || error || !weather) return null

  const condition = conditionWords(weather.condition)
  const cue = precipCue(weather, now)
  const hours = weather.hourlyForecast.filter((h) => h.hour > now.getHours()).slice(0, 5)
  const summary = [
    `${Math.round(weather.currentTemp)}°`,
    condition,
    `high ${Math.round(weather.highTemp)}°, low ${Math.round(weather.lowTemp)}°`,
    cue,
  ].filter(Boolean).join(', ')

  return (
    <span ref={rootRef} className="daybook-weather">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Weather: ${summary}`}
        className="daybook-weather-line"
      >
        {createElement(weatherIcon(weather.weatherCode), { className: 'daybook-weather-icon', strokeWidth: 1.5, 'aria-hidden': true })}
        <span className="daybook-weather-temp">{Math.round(weather.currentTemp)}°</span>
        {condition && <span>{condition}</span>}
        <span className="daybook-weather-sep" aria-hidden="true">·</span>
        <span className="daybook-weather-range">
          {Math.round(weather.highTemp)}° / {Math.round(weather.lowTemp)}°
        </span>
        {cue && (
          <>
            <span className="daybook-weather-sep" aria-hidden="true">·</span>
            <span data-testid="weather-cue">{cue}</span>
          </>
        )}
      </button>

      {open && hours.length > 0 && (
        <span data-testid="weather-forecast" className="daybook-weather-hours">
          {hours.map((h) => (
            <span key={h.hour} className="daybook-weather-hour">
              <span>{h.hour === 0 ? '12a' : h.hour === 12 ? '12p' : h.hour < 12 ? `${h.hour}a` : `${h.hour - 12}p`}</span>
              {createElement(weatherIcon(h.code), { className: 'daybook-weather-icon', strokeWidth: 1.5, 'aria-hidden': true })}
              <span className="tabular-nums">{Math.round(h.temp)}°</span>
            </span>
          ))}
        </span>
      )}
    </span>
  )
}
