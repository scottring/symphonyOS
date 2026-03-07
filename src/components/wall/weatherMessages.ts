/**
 * Weather-driven messaging for the kiosk.
 * Returns contextual suggestions based on weather conditions and temperature.
 */

interface WeatherMessage {
  message: string
  icon: string
  screenTimeAdvice: 'none' | 'reading-first' | 'allowed'
}

export function getWeatherMessage(
  temp: number,
  weatherCode: number,
  hour: number
): WeatherMessage {
  const isEvening = hour >= 17
  const isMorning = hour < 10

  // Storm / thunderstorm (95-99)
  if (weatherCode >= 95) {
    return {
      message: 'Stormy outside — stay in! Board games & reading time.',
      icon: '⛈️',
      screenTimeAdvice: 'reading-first',
    }
  }

  // Snow (71-77, 85-86)
  if ((weatherCode >= 71 && weatherCode <= 77) || (weatherCode >= 85 && weatherCode <= 86)) {
    if (temp > 25) {
      return {
        message: 'Snow day! Bundle up and play outside, then hot cocoa.',
        icon: '☃️',
        screenTimeAdvice: 'none',
      }
    }
    return {
      message: 'Too cold to play outside. Reading & craft time!',
      icon: '❄️',
      screenTimeAdvice: 'reading-first',
    }
  }

  // Rain / drizzle / showers (51-67, 80-82)
  if ((weatherCode >= 51 && weatherCode <= 67) || (weatherCode >= 80 && weatherCode <= 82)) {
    return {
      message: 'Rainy day — reading time first, then screens if chores are done.',
      icon: '🌧️',
      screenTimeAdvice: 'reading-first',
    }
  }

  // Fog (45-48)
  if (weatherCode >= 45 && weatherCode <= 48) {
    return {
      message: 'Foggy out — good day for indoor projects & reading.',
      icon: '🌫️',
      screenTimeAdvice: 'reading-first',
    }
  }

  // Overcast (3)
  if (weatherCode === 3) {
    if (temp >= 55) {
      return {
        message: 'Cloudy but mild — still a good day to play outside!',
        icon: '☁️',
        screenTimeAdvice: 'none',
      }
    }
    return {
      message: 'Gray and chilly. Reading time, then maybe screens.',
      icon: '☁️',
      screenTimeAdvice: 'reading-first',
    }
  }

  // Partly cloudy (1-2)
  if (weatherCode >= 1 && weatherCode <= 2) {
    if (temp >= 55) {
      return {
        message: isEvening
          ? 'Nice evening — go for a family walk!'
          : 'Great weather. Go play outside!',
        icon: '⛅',
        screenTimeAdvice: 'none',
      }
    }
    return {
      message: 'A bit cool — grab a jacket and get some fresh air.',
      icon: '⛅',
      screenTimeAdvice: 'none',
    }
  }

  // Clear (0)
  if (temp >= 90) {
    return {
      message: 'Hot out! Play outside with water, or stay cool inside.',
      icon: '🔥',
      screenTimeAdvice: 'none',
    }
  }

  if (temp >= 55) {
    if (isEvening) {
      return {
        message: 'Beautiful evening. Get outside before dark!',
        icon: '☀️',
        screenTimeAdvice: 'none',
      }
    }
    if (isMorning) {
      return {
        message: 'Gorgeous morning! Get outside early.',
        icon: '☀️',
        screenTimeAdvice: 'none',
      }
    }
    return {
      message: 'Perfect day — no screens. Go play outside!',
      icon: '☀️',
      screenTimeAdvice: 'none',
    }
  }

  // Clear but cold
  return {
    message: 'Sunny but cold. Bundle up for a quick outdoor adventure!',
    icon: '🥶',
    screenTimeAdvice: 'none',
  }
}

export function getWeatherEmoji(code: number): string {
  if (code === 0) return '☀️'
  if (code <= 2) return '⛅'
  if (code === 3) return '☁️'
  if (code <= 48) return '🌫️'
  if (code <= 57) return '🌧️'
  if (code <= 67) return '🌧️'
  if (code <= 77) return '❄️'
  if (code <= 82) return '🌦️'
  if (code <= 86) return '🌨️'
  if (code >= 95) return '⛈️'
  return '🌤️'
}
