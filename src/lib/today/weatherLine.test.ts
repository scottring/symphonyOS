import { describe, it, expect } from 'vitest'
import type { WeatherData } from '@/hooks/useWeather'
import { precipCue, conditionWords, wetKind } from './weatherLine'

const at = (hour: number) => new Date(2026, 8, 19, hour, 10)
const w = (o: Partial<WeatherData>): WeatherData => ({
  currentTemp: 63, weatherCode: 0, condition: 'Clear', highTemp: 78, lowTemp: 58, hourlyForecast: [], ...o,
})

describe('precipCue', () => {
  it('says nothing on a dry day', () => {
    expect(precipCue(w({ hourlyForecast: [{ hour: 11, temp: 65, code: 1 }, { hour: 12, temp: 68, code: 3 }] }), at(10))).toBeNull()
  })
  it('names the first wet hour ahead', () => {
    const weather = w({ hourlyForecast: [{ hour: 14, temp: 70, code: 2 }, { hour: 15, temp: 69, code: 61 }, { hour: 16, temp: 66, code: 95 }] })
    expect(precipCue(weather, at(13))).toBe('Rain from 3 PM')
  })
  it('distinguishes snow and storms', () => {
    expect(precipCue(w({ hourlyForecast: [{ hour: 9, temp: 30, code: 73 }] }), at(8))).toBe('Snow from 9 AM')
    expect(precipCue(w({ hourlyForecast: [{ hour: 12, temp: 80, code: 95 }] }), at(8))).toBe('Storms from 12 PM')
  })
  it('ignores hours already past (a cached reading can be hours old)', () => {
    const weather = w({ hourlyForecast: [{ hour: 9, temp: 60, code: 61 }, { hour: 10, temp: 62, code: 0 }] })
    expect(precipCue(weather, at(14))).toBeNull()
  })
  it('when it is already raining, only says when it clears', () => {
    const raining = w({ weatherCode: 63, condition: 'Rain', hourlyForecast: [{ hour: 11, temp: 60, code: 63 }, { hour: 12, temp: 61, code: 3 }] })
    expect(precipCue(raining, at(10))).toBe('Clearing by 12 PM')
    const allDay = w({ weatherCode: 63, condition: 'Rain', hourlyForecast: [{ hour: 11, temp: 60, code: 63 }] })
    expect(precipCue(allDay, at(10))).toBeNull()
  })
})

describe('wetKind', () => {
  it('treats fog and cloud as dry', () => {
    expect(wetKind(45)).toBeNull()
    expect(wetKind(3)).toBeNull()
    expect(wetKind(80)).toBe('Rain')
  })
})

describe('conditionWords', () => {
  it('reads as a sentence and drops Unknown', () => {
    expect(conditionWords('Partly Cloudy')).toBe('Partly cloudy')
    expect(conditionWords('Unknown')).toBe('')
  })
})
