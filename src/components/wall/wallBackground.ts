/**
 * Dynamic wall background based on weather + time of day.
 * The background should FEEL like the weather — sunny days are warm and bright,
 * rainy days are moody and gray, snow is cool and pale.
 */

type TimeOfDay = 'dawn' | 'morning' | 'midday' | 'afternoon' | 'sunset' | 'evening' | 'night'
type WeatherType = 'clear' | 'partly-cloudy' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'storm'

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
  if (code <= 2) return 'partly-cloudy'
  if (code === 3) return 'cloudy'
  if (code <= 48) return 'fog'
  if (code <= 67) return 'rain'
  if (code <= 77) return 'snow'
  if (code <= 82) return 'rain'
  if (code <= 86) return 'snow'
  if (code >= 95) return 'storm'
  return 'cloudy'
}

// Weather-first backgrounds — the weather drives the mood, time shifts the hue
const WEATHER_BACKGROUNDS: Record<WeatherType, Record<TimeOfDay, string>> = {
  clear: {
    dawn:      'linear-gradient(180deg, #1a1040 0%, #4a2060 20%, #c06040 50%, #e8a050 80%, #f0c060 100%)',
    morning:   'linear-gradient(180deg, #1a5090 0%, #2878b8 30%, #40a0d0 60%, #60c0e0 100%)',
    midday:    'linear-gradient(180deg, #1060b0 0%, #2080d0 30%, #3098e0 60%, #48b0e8 100%)',
    afternoon: 'linear-gradient(180deg, #1a5898 0%, #2870a8 35%, #3890c0 65%, #50a8d0 100%)',
    sunset:    'linear-gradient(180deg, #1a1840 0%, #602050 20%, #c04838 45%, #e88030 70%, #f0a840 100%)',
    evening:   'linear-gradient(180deg, #0a0e28 0%, #152050 30%, #203068 60%, #182848 100%)',
    night:     'linear-gradient(180deg, #060818 0%, #0a1028 40%, #101830 100%)',
  },
  'partly-cloudy': {
    dawn:      'linear-gradient(180deg, #1a1838 0%, #3a2850 25%, #8a5048 55%, #b08050 85%, #c09060 100%)',
    morning:   'linear-gradient(180deg, #1a4878 0%, #286898 30%, #3888a8 60%, #5098b0 100%)',
    midday:    'linear-gradient(180deg, #185088 0%, #2868a0 30%, #3880b0 60%, #4890b8 100%)',
    afternoon: 'linear-gradient(180deg, #1a4878 0%, #286090 35%, #387898 65%, #488898 100%)',
    sunset:    'linear-gradient(180deg, #181838 0%, #4a2848 22%, #984038 48%, #c07030 72%, #d89040 100%)',
    evening:   'linear-gradient(180deg, #0a0e24 0%, #142040 30%, #1e2850 60%, #182040 100%)',
    night:     'linear-gradient(180deg, #060816 0%, #0a0e22 40%, #101828 100%)',
  },
  cloudy: {
    dawn:      'linear-gradient(180deg, #1a1830 0%, #2a2840 30%, #484050 60%, #5a5058 100%)',
    morning:   'linear-gradient(180deg, #2a3848 0%, #3a4858 30%, #485868 60%, #586878 100%)',
    midday:    'linear-gradient(180deg, #304050 0%, #405060 30%, #506070 60%, #607080 100%)',
    afternoon: 'linear-gradient(180deg, #2a3848 0%, #3a4858 35%, #485060 65%, #506068 100%)',
    sunset:    'linear-gradient(180deg, #1a1828 0%, #302838 25%, #584048 50%, #684840 80%, #705838 100%)',
    evening:   'linear-gradient(180deg, #0a0e1a 0%, #182030 30%, #202838 60%, #181e28 100%)',
    night:     'linear-gradient(180deg, #060810 0%, #0a0e18 40%, #101420 100%)',
  },
  fog: {
    dawn:      'linear-gradient(180deg, #282830 0%, #383840 30%, #505058 60%, #606068 100%)',
    morning:   'linear-gradient(180deg, #384048 0%, #485058 30%, #586068 60%, #687078 100%)',
    midday:    'linear-gradient(180deg, #404850 0%, #505860 30%, #606870 60%, #707880 100%)',
    afternoon: 'linear-gradient(180deg, #384048 0%, #485058 35%, #585e68 65%, #606870 100%)',
    sunset:    'linear-gradient(180deg, #282830 0%, #383838 30%, #504848 60%, #585050 100%)',
    evening:   'linear-gradient(180deg, #101418 0%, #1a2028 30%, #222830 60%, #181e24 100%)',
    night:     'linear-gradient(180deg, #080a10 0%, #0e1218 40%, #141820 100%)',
  },
  rain: {
    dawn:      'linear-gradient(180deg, #101420 0%, #1a2030 30%, #283040 60%, #303848 100%)',
    morning:   'linear-gradient(180deg, #182838 0%, #203040 30%, #283848 60%, #304050 100%)',
    midday:    'linear-gradient(180deg, #1a2838 0%, #223040 30%, #2a3848 60%, #324050 100%)',
    afternoon: 'linear-gradient(180deg, #182838 0%, #1e2e3e 35%, #283848 65%, #303e48 100%)',
    sunset:    'linear-gradient(180deg, #101420 0%, #1a2030 25%, #282e38 50%, #302828 80%, #382820 100%)',
    evening:   'linear-gradient(180deg, #080c14 0%, #101820 30%, #182028 60%, #101418 100%)',
    night:     'linear-gradient(180deg, #04060c 0%, #080c14 40%, #0e1218 100%)',
  },
  snow: {
    dawn:      'linear-gradient(180deg, #1a1830 0%, #282838 25%, #404050 50%, #585868 80%, #686878 100%)',
    morning:   'linear-gradient(180deg, #283848 0%, #3a4858 30%, #4a5a70 60%, #5a6a80 100%)',
    midday:    'linear-gradient(180deg, #304058 0%, #405068 30%, #506078 60%, #607088 100%)',
    afternoon: 'linear-gradient(180deg, #283848 0%, #384860 35%, #485870 65%, #586878 100%)',
    sunset:    'linear-gradient(180deg, #181828 0%, #282838 25%, #3a3848 50%, #504850 80%, #585060 100%)',
    evening:   'linear-gradient(180deg, #0a0e18 0%, #141828 30%, #1e2438 60%, #141820 100%)',
    night:     'linear-gradient(180deg, #060810 0%, #0a1018 40%, #101820 100%)',
  },
  storm: {
    dawn:      'linear-gradient(180deg, #0a0c18 0%, #141820 30%, #1e2028 60%, #282830 100%)',
    morning:   'linear-gradient(180deg, #101820 0%, #182028 30%, #202830 60%, #283038 100%)',
    midday:    'linear-gradient(180deg, #101820 0%, #182028 30%, #1e2830 60%, #283038 100%)',
    afternoon: 'linear-gradient(180deg, #101820 0%, #162028 35%, #1e2830 65%, #262e38 100%)',
    sunset:    'linear-gradient(180deg, #0a0c14 0%, #141418 25%, #201c20 50%, #2a2020 80%, #302018 100%)',
    evening:   'linear-gradient(180deg, #060810 0%, #0c1018 30%, #141820 60%, #0c1014 100%)',
    night:     'linear-gradient(180deg, #040608 0%, #080a10 40%, #0c0e14 100%)',
  },
}

export function getWallBackground(hour: number, weatherCode?: number): {
  background: string
  overlay: string
  overlayOpacity: number
  textClass: string
} {
  const timeOfDay = getTimeOfDay(hour)
  const weatherType = weatherCode !== undefined ? getWeatherType(weatherCode) : 'clear'

  return {
    background: WEATHER_BACKGROUNDS[weatherType][timeOfDay],
    overlay: '',
    overlayOpacity: 0,
    textClass: 'text-white',
  }
}
