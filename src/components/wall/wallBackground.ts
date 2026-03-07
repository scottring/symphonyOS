/**
 * Dynamic wall background based on weather + time of day.
 * Colors are VIVID and DISTINCT — you should immediately feel the weather.
 * Clear = bright blue, fog = milky gray, rain = dark steel blue, etc.
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

// Vivid, iOS Weather-inspired gradients
const WEATHER_BACKGROUNDS: Record<WeatherType, Record<TimeOfDay, string>> = {
  clear: {
    dawn:      'linear-gradient(180deg, #1b1145 0%, #6b2a6e 25%, #d4603e 55%, #f0a848 80%, #fcd770 100%)',
    morning:   'linear-gradient(180deg, #1565c0 0%, #1e88e5 30%, #42a5f5 60%, #64b5f6 100%)',
    midday:    'linear-gradient(180deg, #0d47a1 0%, #1976d2 30%, #2196f3 60%, #42a5f5 100%)',
    afternoon: 'linear-gradient(180deg, #1565c0 0%, #1e88e5 35%, #42a5f5 65%, #64b5f6 100%)',
    sunset:    'linear-gradient(180deg, #1a1050 0%, #7b1fa2 18%, #e53935 42%, #ff8f00 68%, #ffc107 100%)',
    evening:   'linear-gradient(180deg, #0d1b3e 0%, #1a237e 35%, #283593 65%, #1a2260 100%)',
    night:     'linear-gradient(180deg, #050a1a 0%, #0a1628 40%, #0f1f38 100%)',
  },
  'partly-cloudy': {
    dawn:      'linear-gradient(180deg, #1a1540 0%, #4a2858 25%, #a05848 55%, #c89050 80%, #d8a860 100%)',
    morning:   'linear-gradient(180deg, #2a5a8a 0%, #3a78a8 30%, #5090b8 60%, #68a0c0 100%)',
    midday:    'linear-gradient(180deg, #2a5898 0%, #3870a8 30%, #4888b8 60%, #5898c0 100%)',
    afternoon: 'linear-gradient(180deg, #2a5a8a 0%, #3870a0 35%, #4888b0 65%, #5a98b8 100%)',
    sunset:    'linear-gradient(180deg, #181540 0%, #582858 22%, #b84838 48%, #d87830 72%, #e89840 100%)',
    evening:   'linear-gradient(180deg, #0c1530 0%, #1a2858 35%, #243568 65%, #1a2850 100%)',
    night:     'linear-gradient(180deg, #050818 0%, #0a1025 40%, #101a30 100%)',
  },
  cloudy: {
    dawn:      'linear-gradient(180deg, #2a2838 0%, #3e3a4e 30%, #5a5060 60%, #6a6068 100%)',
    morning:   'linear-gradient(180deg, #3a4858 0%, #4e5e70 30%, #607080 60%, #728090 100%)',
    midday:    'linear-gradient(180deg, #445868 0%, #586e80 30%, #6a8090 60%, #7c90a0 100%)',
    afternoon: 'linear-gradient(180deg, #3a4858 0%, #4e5e70 35%, #607080 65%, #6e7e8e 100%)',
    sunset:    'linear-gradient(180deg, #201828 0%, #3a3040 25%, #685050 50%, #806848 80%, #907040 100%)',
    evening:   'linear-gradient(180deg, #0e1420 0%, #1e2838 35%, #283848 65%, #1e2a38 100%)',
    night:     'linear-gradient(180deg, #080c14 0%, #0e1420 40%, #141c28 100%)',
  },
  fog: {
    dawn:      'linear-gradient(180deg, #3a3842 0%, #505058 30%, #686870 60%, #787880 100%)',
    morning:   'linear-gradient(180deg, #506068 0%, #627280 30%, #748490 60%, #8694a0 100%)',
    midday:    'linear-gradient(180deg, #5a6a74 0%, #6c7c88 30%, #7e8e98 60%, #90a0a8 100%)',
    afternoon: 'linear-gradient(180deg, #506068 0%, #627280 35%, #748490 65%, #849098 100%)',
    sunset:    'linear-gradient(180deg, #383840 0%, #484848 30%, #605858 60%, #686060 100%)',
    evening:   'linear-gradient(180deg, #141820 0%, #222a34 35%, #2e3840 65%, #222a32 100%)',
    night:     'linear-gradient(180deg, #0a0e14 0%, #121820 40%, #1a2028 100%)',
  },
  rain: {
    dawn:      'linear-gradient(180deg, #141828 0%, #1e2a3a 30%, #2a3a50 60%, #344a60 100%)',
    morning:   'linear-gradient(180deg, #1a3048 0%, #264060 30%, #325070 60%, #3e6080 100%)',
    midday:    'linear-gradient(180deg, #1e3450 0%, #284460 30%, #345470 60%, #406480 100%)',
    afternoon: 'linear-gradient(180deg, #1a3048 0%, #244058 35%, #2e4e68 65%, #385a78 100%)',
    sunset:    'linear-gradient(180deg, #141828 0%, #1e2838 25%, #303840 50%, #403830 80%, #504028 100%)',
    evening:   'linear-gradient(180deg, #0a1018 0%, #142030 35%, #1c2838 65%, #121a24 100%)',
    night:     'linear-gradient(180deg, #06080e 0%, #0c1218 40%, #141a22 100%)',
  },
  snow: {
    dawn:      'linear-gradient(180deg, #282840 0%, #383c50 25%, #505468 50%, #687080 80%, #788898 100%)',
    morning:   'linear-gradient(180deg, #3a4c60 0%, #4e6478 30%, #627c92 60%, #7690a8 100%)',
    midday:    'linear-gradient(180deg, #405868 0%, #547080 30%, #688898 60%, #7ca0b0 100%)',
    afternoon: 'linear-gradient(180deg, #3a4c60 0%, #4e6478 35%, #607888 65%, #708898 100%)',
    sunset:    'linear-gradient(180deg, #202030 0%, #303848 25%, #484858 50%, #605060 80%, #685870 100%)',
    evening:   'linear-gradient(180deg, #0c1020 0%, #1a2438 35%, #243048 65%, #1a2030 100%)',
    night:     'linear-gradient(180deg, #080c14 0%, #10181e 40%, #182028 100%)',
  },
  storm: {
    dawn:      'linear-gradient(180deg, #0c0e1c 0%, #181c28 30%, #242830 60%, #303438 100%)',
    morning:   'linear-gradient(180deg, #142028 0%, #1e2c38 30%, #283a48 60%, #324858 100%)',
    midday:    'linear-gradient(180deg, #142028 0%, #1e2c38 30%, #263640 60%, #304450 100%)',
    afternoon: 'linear-gradient(180deg, #142028 0%, #1a2830 35%, #243440 65%, #2e4050 100%)',
    sunset:    'linear-gradient(180deg, #0c0e18 0%, #181820 25%, #282028 50%, #342828 80%, #3c2c20 100%)',
    evening:   'linear-gradient(180deg, #080c14 0%, #10181e 35%, #182028 65%, #101418 100%)',
    night:     'linear-gradient(180deg, #04060a 0%, #0a0e14 40%, #10141a 100%)',
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
