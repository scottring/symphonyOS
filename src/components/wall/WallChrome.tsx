interface Weather {
  temp: number
  description: string
  high: number
  low: number
}

interface WallChromeProps {
  now: Date
  weather: Weather | null
}

function formatTime(date: Date): { time: string; period: string; dateStr: string } {
  const hours = date.getHours()
  const minutes = date.getMinutes()
  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHour = hours % 12 || 12
  const time = `${displayHour}:${minutes.toString().padStart(2, '0')}`
  const dateStr = date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).toUpperCase()
  return { time, period, dateStr }
}

export function WallChrome({ now, weather }: WallChromeProps) {
  const { time, period, dateStr } = formatTime(now)
  return (
    <div className="flex justify-between items-start px-2 mb-3">
      <div>
        <div className="font-display text-3xl font-medium text-white leading-none">
          {time}<span className="text-sm opacity-50 ml-1.5">{period}</span>
        </div>
        <div className="text-[11px] uppercase tracking-widest text-white/50 mt-1">{dateStr}</div>
      </div>
      {weather && (
        <div className="text-right" data-weather>
          <div className="font-display text-3xl text-white">{Math.round(weather.temp)}°</div>
          <div className="text-[11px] uppercase tracking-widest text-white/50 mt-1">
            {weather.description} · {Math.round(weather.high)}/{Math.round(weather.low)}
          </div>
        </div>
      )}
    </div>
  )
}
