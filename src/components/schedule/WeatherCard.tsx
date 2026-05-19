import { createElement } from 'react'
import { useWeather } from '@/hooks/useWeather'
import { weatherIcon } from '@/lib/weatherIcon'

export function WeatherCard() {
  const { weather, loading, error } = useWeather()

  if (loading) {
    return (
      <div className="card px-5 py-4" data-testid="weather-skeleton">
        <div className="h-9 w-24 rounded bg-neutral-100 animate-pulse" />
      </div>
    )
  }
  if (error || !weather) {
    return (
      <div className="card px-5 py-4 text-[13px] text-neutral-400">
        Weather unavailable
      </div>
    )
  }
  return (
    <div className="card px-5 py-4 flex items-center gap-4">
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
    </div>
  )
}
