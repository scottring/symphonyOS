import { describe, it, expect } from 'vitest'
import { isQuietHours } from './quietHours'

const at = (hour: number) => new Date(2026, 4, 29, hour, 0, 0)

describe('isQuietHours', () => {
  it('is true overnight (23:00–05:59)', () => {
    expect(isQuietHours(at(23))).toBe(true)
    expect(isQuietHours(at(0))).toBe(true)
    expect(isQuietHours(at(3))).toBe(true)
    expect(isQuietHours(at(5))).toBe(true)
  })

  it('is false during waking hours (06:00–22:59)', () => {
    expect(isQuietHours(at(6))).toBe(false)
    expect(isQuietHours(at(12))).toBe(false)
    expect(isQuietHours(at(22))).toBe(false)
  })
})
