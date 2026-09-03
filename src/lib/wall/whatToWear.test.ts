import { describe, it, expect } from 'vitest'
import { whatToWear } from './whatToWear'
import type { WeatherData } from '@/hooks/useWeather'

const now = new Date(2026, 8, 3, 6, 50)
const w = (o: Partial<WeatherData>): WeatherData =>
  ({ currentTemp: 55, weatherCode: 1, condition: 'Cloudy', highTemp: 72, lowTemp: 50, hourlyForecast: [], ...o })

describe('whatToWear', () => {
  it('reads the HIGH, not the 6:50am temperature', () => {
    expect(whatToWear(w({ currentTemp: 48, highTemp: 74 }), now)?.wear).toBe('Shorts weather')
  })
  it('rain during the school day means a raincoat, even if it is dry at breakfast', () => {
    const r = whatToWear(w({ weatherCode: 1, hourlyForecast: [{ hour: 8, temp: 60, code: 1 }, { hour: 14, temp: 66, code: 61 }] }), now)
    expect(r?.wear).toBe('Raincoat')
  })
  it('rain after bedtime does not', () => {
    const r = whatToWear(w({ hourlyForecast: [{ hour: 21, temp: 60, code: 61 }] }), now)
    expect(r?.wear).toBe('Shorts weather')
  })
  it('steps down with the temperature', () => {
    expect(whatToWear(w({ highTemp: 65 }), now)?.wear).toBe('Light jacket or hoodie')
    expect(whatToWear(w({ highTemp: 50 }), now)?.wear).toBe('Warm jacket')
    expect(whatToWear(w({ highTemp: 35 }), now)?.wear).toBe('Winter coat, hat and gloves')
    expect(whatToWear(w({ weatherCode: 71, highTemp: 30 }), now)?.wear).toMatch(/Snow boots/)
  })
  it('says nothing with no forecast', () => expect(whatToWear(null, now)).toBeNull())
})
