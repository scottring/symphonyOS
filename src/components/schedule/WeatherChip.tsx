import { createElement, useState } from 'react'
import { useWeather } from '@/hooks/useWeather'
import { weatherIcon } from '@/lib/weatherIcon'

/**
 * Compact weather chip for the Today stats row. Replaces the old full-width
 * WeatherCard. Renders nothing while loading or on error (keeps the row calm).
 * Click toggles a small popover with the hourly forecast.
 */
export function WeatherChip() {
  const { weather, loading, error } = useWeather()
  const [open, setOpen] = useState(false)

  if (loading || error || !weather) return null

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 text-[13px] text-neutral-500 hover:text-neutral-700 transition-colors"
        aria-label="Weather"
      >
        {createElement(weatherIcon(weather.weatherCode), { className: 'w-4 h-4 text-amber-500' })}
        <span className="tabular-nums">{Math.round(weather.currentTemp)}°</span>
        <span className="text-neutral-400">H{Math.round(weather.highTemp)}/L{Math.round(weather.lowTemp)}</span>
      </button>

      {open && weather.hourlyForecast.length > 0 && (
        <div
          data-testid="weather-forecast"
          className="absolute left-0 top-full mt-2 z-50 bg-white rounded-xl border border-neutral-200 shadow-lg p-2 flex gap-3 overflow-x-auto max-w-[20rem]"
          onMouseLeave={() => setOpen(false)}
        >
          {weather.hourlyForecast.map((h) => {
            const label = h.hour === 0 ? '12a' : h.hour === 12 ? '12p' : h.hour < 12 ? `${h.hour}a` : `${h.hour - 12}p`
            return (
              <div key={h.hour} className="flex flex-col items-center gap-0.5 text-[11px] text-neutral-500 shrink-0">
                <span>{label}</span>
                {createElement(weatherIcon(h.code), { className: 'w-4 h-4 text-amber-500' })}
                <span className="tabular-nums">{Math.round(h.temp)}°</span>
              </div>
            )
          })}
        </div>
      )}
    </span>
  )
}
