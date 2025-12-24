/**
 * Weather Service
 *
 * Integrates with OpenWeatherMap API to fetch weather forecasts for destinations.
 * Provides analyzed summaries to inform packing list recommendations.
 */

const OPENWEATHER_API_KEY = import.meta.env.VITE_OPENWEATHER_API_KEY
const OPENWEATHER_BASE_URL = 'https://api.openweathermap.org/data/2.5'

// Cache weather data for 1 hour to reduce API calls
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour
const weatherCache = new Map<string, { data: WeatherSummary; timestamp: number }>()

export interface WeatherForecast {
  date: string
  temp_min: number
  temp_max: number
  conditions: string[]
  precipitation_chance: number
  description: string
}

export interface WeatherSummary {
  location: string
  forecasts: WeatherForecast[]
  temp_range: {
    min: number
    max: number
    unit: 'F' | 'C'
  }
  conditions_summary: string[]
  needs_rain_gear: boolean
  needs_warm_layers: boolean
  needs_sun_protection: boolean
}

/**
 * Fetch weather forecast for a location and date range
 */
export async function fetchWeatherForecast(
  lat: number,
  lng: number,
  locationName: string,
  startDate: Date,
  endDate: Date
): Promise<WeatherSummary> {
  // Check cache first
  const cacheKey = `weather_${lat}_${lng}_${startDate.toISOString().split('T')[0]}`
  const cached = weatherCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    console.log('Weather data from cache:', cacheKey)
    return cached.data
  }

  if (!OPENWEATHER_API_KEY) {
    console.warn('OpenWeatherMap API key not configured. Using default weather assumptions.')
    return getDefaultWeatherSummary(locationName)
  }

  try {
    // Fetch 5-day forecast from OpenWeatherMap
    const url = `${OPENWEATHER_BASE_URL}/forecast?lat=${lat}&lon=${lng}&appid=${OPENWEATHER_API_KEY}&units=imperial`
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`OpenWeatherMap API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()

    // Process forecast data
    const summary = processWeatherData(data, locationName, startDate, endDate)

    // Cache the result
    weatherCache.set(cacheKey, {
      data: summary,
      timestamp: Date.now()
    })

    return summary
  } catch (error) {
    console.error('Failed to fetch weather data:', error)
    return getDefaultWeatherSummary(locationName)
  }
}

/**
 * Process OpenWeatherMap forecast data into our summary format
 */
function processWeatherData(
  data: any,
  locationName: string,
  startDate: Date,
  endDate: Date
): WeatherSummary {
  const forecasts: WeatherForecast[] = []
  const dailyData = new Map<string, any[]>()

  // Group forecast items by date
  for (const item of data.list) {
    const date = new Date(item.dt * 1000)
    if (date >= startDate && date <= endDate) {
      const dateKey = date.toISOString().split('T')[0]
      if (!dailyData.has(dateKey)) {
        dailyData.set(dateKey, [])
      }
      dailyData.get(dateKey)!.push(item)
    }
  }

  // Aggregate daily forecasts
  let minTemp = Infinity
  let maxTemp = -Infinity
  const allConditions = new Set<string>()
  let totalPrecipChance = 0
  let precipCount = 0

  for (const [date, items] of dailyData.entries()) {
    const dayMin = Math.min(...items.map(i => i.main.temp_min))
    const dayMax = Math.max(...items.map(i => i.main.temp_max))
    const conditions = [...new Set(items.map(i => i.weather[0].main))]
    const precipChance = Math.max(...items.map(i => i.pop || 0)) * 100

    minTemp = Math.min(minTemp, dayMin)
    maxTemp = Math.max(maxTemp, dayMax)
    conditions.forEach(c => allConditions.add(c))
    totalPrecipChance += precipChance
    precipCount++

    forecasts.push({
      date,
      temp_min: Math.round(dayMin),
      temp_max: Math.round(dayMax),
      conditions,
      precipitation_chance: Math.round(precipChance),
      description: items[0].weather[0].description
    })
  }

  const avgPrecipChance = precipCount > 0 ? totalPrecipChance / precipCount : 0

  return {
    location: locationName,
    forecasts,
    temp_range: {
      min: Math.round(minTemp),
      max: Math.round(maxTemp),
      unit: 'F'
    },
    conditions_summary: Array.from(allConditions),
    needs_rain_gear: avgPrecipChance > 30 || allConditions.has('Rain'),
    needs_warm_layers: minTemp < 60,
    needs_sun_protection: allConditions.has('Clear') || maxTemp > 75
  }
}

/**
 * Get default weather summary when API is unavailable
 */
function getDefaultWeatherSummary(locationName: string): WeatherSummary {
  return {
    location: locationName,
    forecasts: [],
    temp_range: {
      min: 60,
      max: 75,
      unit: 'F'
    },
    conditions_summary: ['Unknown'],
    needs_rain_gear: true, // Better safe than sorry
    needs_warm_layers: true,
    needs_sun_protection: true
  }
}

/**
 * Clear weather cache (useful for testing)
 */
export function clearWeatherCache(): void {
  weatherCache.clear()
}
