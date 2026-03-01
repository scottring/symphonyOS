/**
 * Dynamic wall background based on weather + time of day.
 * Returns a CSS gradient string for the kiosk background.
 */

type TimeOfDay = 'dawn' | 'morning' | 'midday' | 'afternoon' | 'sunset' | 'evening' | 'night'
type WeatherType = 'clear' | 'cloudy' | 'overcast' | 'fog' | 'rain' | 'snow' | 'storm'

function getTimeOfDay(hour: number): TimeOfDay {
  if (hour >= 5 && hour < 7) return 'dawn'
  if (hour >= 7 && hour < 10) return 'morning'
  if (hour >= 10 && hour < 14) return 'midday'
  if (hour >= 14 && hour < 17) return 'afternoon'
  if (hour >= 17 && hour < 19) return 'sunset'
  if (hour >= 19 && hour < 21) return 'evening'
  return 'night'
}

function getWeatherType(code: number): WeatherType {
  if (code === 0) return 'clear'
  if (code <= 3) return 'cloudy'
  if (code <= 48) return 'fog'
  if (code <= 67) return 'rain'
  if (code <= 77) return 'snow'
  if (code <= 82) return 'rain'
  if (code <= 86) return 'snow'
  if (code >= 95) return 'storm'
  return 'cloudy'
}

// Base sky gradients by time of day
const TIME_GRADIENTS: Record<TimeOfDay, string> = {
  dawn:      'linear-gradient(180deg, #1a1a3e 0%, #4a3f6b 25%, #e8837c 55%, #f7c56e 80%, #fceabb 100%)',
  morning:   'linear-gradient(180deg, #4facfe 0%, #7ec8e3 40%, #b8e6d0 70%, #e8f5e2 100%)',
  midday:    'linear-gradient(180deg, #2196f3 0%, #42a5f5 30%, #64b5f6 60%, #90caf9 100%)',
  afternoon: 'linear-gradient(180deg, #3d85c6 0%, #5c9fd4 35%, #87bde0 65%, #a8d5ba 100%)',
  sunset:    'linear-gradient(180deg, #2c3e6b 0%, #7b4397 25%, #dc6b4f 50%, #f79d3d 75%, #f7c56e 100%)',
  evening:   'linear-gradient(180deg, #0f1729 0%, #1a2744 30%, #2d3f6a 60%, #4a3f6b 100%)',
  night:     'linear-gradient(180deg, #0a0e1a 0%, #111827 40%, #1e293b 100%)',
}

// Weather overlays — subtle tints applied on top
const WEATHER_OVERLAYS: Record<WeatherType, { gradient: string; opacity: number }> = {
  clear:    { gradient: '', opacity: 0 },
  cloudy:   { gradient: 'linear-gradient(180deg, rgba(148,163,184,0.15) 0%, rgba(148,163,184,0.08) 50%, transparent 100%)', opacity: 1 },
  overcast: { gradient: 'linear-gradient(180deg, rgba(100,116,139,0.3) 0%, rgba(100,116,139,0.15) 50%, rgba(100,116,139,0.1) 100%)', opacity: 1 },
  fog:      { gradient: 'linear-gradient(180deg, rgba(203,213,225,0.35) 0%, rgba(203,213,225,0.25) 40%, rgba(203,213,225,0.15) 100%)', opacity: 1 },
  rain:     { gradient: 'linear-gradient(180deg, rgba(71,85,105,0.35) 0%, rgba(71,85,105,0.2) 50%, rgba(51,65,85,0.15) 100%)', opacity: 1 },
  snow:     { gradient: 'linear-gradient(180deg, rgba(226,232,240,0.25) 0%, rgba(203,213,225,0.15) 50%, rgba(226,232,240,0.1) 100%)', opacity: 1 },
  storm:    { gradient: 'linear-gradient(180deg, rgba(30,41,59,0.5) 0%, rgba(51,65,85,0.35) 40%, rgba(71,85,105,0.2) 100%)', opacity: 1 },
}

export function getWallBackground(hour: number, weatherCode?: number): {
  background: string
  overlay: string
  overlayOpacity: number
  textClass: string // whether text should be light or dark
} {
  const timeOfDay = getTimeOfDay(hour)
  const weatherType = weatherCode !== undefined ? getWeatherType(weatherCode) : 'clear'
  const weather = WEATHER_OVERLAYS[weatherType]

  // Morning with clear sky = bright, use darker text
  const isBright = timeOfDay === 'midday' && weatherType === 'clear'

  return {
    background: TIME_GRADIENTS[timeOfDay],
    overlay: weather.gradient,
    overlayOpacity: weather.opacity,
    textClass: isBright ? 'text-white' : 'text-white',
  }
}
