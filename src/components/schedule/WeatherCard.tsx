import { createElement, useState } from 'react'
import { useWeather } from '@/hooks/useWeather'
import { weatherIcon } from '@/lib/weatherIcon'

export function WeatherCard() {
  const { weather, loading, error } = useWeather()
  const [open, setOpen] = useState(false)

  if (loading) {
    return (
      <div className="card px-5 py-4 bg-[hsl(145_24%_95%)] border border-[hsl(145_20%_88%)]" data-testid="weather-skeleton">
        <div className="h-9 w-24 rounded bg-neutral-100 animate-pulse" />
      </div>
    )
  }
  if (error || !weather) {
    return (
      <div className="card px-5 py-4 text-[13px] text-neutral-400 bg-[hsl(145_24%_95%)] border border-[hsl(145_20%_88%)]">
        Weather unavailable
      </div>
    )
  }

  const isClickable = weather.hourlyForecast.length > 0
  const cardElement = isClickable ? 'button' : 'div'
  const cardProps = isClickable
    ? {
        type: 'button',
        'aria-label': 'Weather',
        onClick: () => setOpen((o) => !o),
      }
    : {}

  return createElement(
    cardElement,
    {
      className: 'card px-5 py-4 flex flex-col gap-3 w-full text-left bg-[hsl(145_24%_95%)] border border-[hsl(145_20%_88%)]',
      ...cardProps,
    },
    <div className="flex items-center gap-4">
      <span className="shrink-0 inline-flex items-center justify-center w-11 h-11 rounded-xl bg-amber-50 text-amber-500">
        {createElement(weatherIcon(weather.weatherCode), { className: 'w-6 h-6' })}
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">Weather</p>
        <p className="font-display text-2xl text-neutral-800 leading-tight">
          {Math.round(weather.currentTemp)}° <span className="text-base text-neutral-500 align-middle">{weather.condition}</span>
        </p>
        <p className="text-[12px] text-neutral-400">
          Low {Math.round(weather.lowTemp)}° · High {Math.round(weather.highTemp)}°
        </p>
      </div>
    </div>,
    open && (
      <div data-testid="weather-forecast" className="pt-3 border-t border-neutral-200 flex gap-3 overflow-x-auto">
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
    )
  )
}
