import { describe, it, expect } from 'vitest'
import { Sun, CloudSun, Cloud, CloudFog, CloudRain, CloudSnow, CloudLightning } from 'lucide-react'
import { weatherIcon } from './weatherIcon'

describe('weatherIcon', () => {
  it('maps WMO codes to lucide icons', () => {
    expect(weatherIcon(0)).toBe(Sun)
    expect(weatherIcon(2)).toBe(CloudSun)
    expect(weatherIcon(3)).toBe(Cloud)
    expect(weatherIcon(45)).toBe(CloudFog)
    expect(weatherIcon(61)).toBe(CloudRain)
    expect(weatherIcon(73)).toBe(CloudSnow)
    expect(weatherIcon(95)).toBe(CloudLightning)
  })
  it('falls back to Cloud for unknown codes', () => {
    expect(weatherIcon(999)).toBe(Cloud)
  })
})
