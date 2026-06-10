import { describe, it, expect } from 'vitest'
import { isWorkingHours, isFamilyHours } from './workingHours'

// 2026-06-10 is a Wednesday; 2026-06-13 is a Saturday.
const wed = (h: number, m = 0) => new Date(2026, 5, 10, h, m)
const sat = (h: number, m = 0) => new Date(2026, 5, 13, h, m)

describe('isWorkingHours', () => {
  it('weekday inside 9:00–17:30 is working hours', () => {
    expect(isWorkingHours(wed(9, 0))).toBe(true)
    expect(isWorkingHours(wed(12, 0))).toBe(true)
    expect(isWorkingHours(wed(17, 29))).toBe(true)
  })
  it('weekday before 9:00 or at/after 17:30 is not working hours', () => {
    expect(isWorkingHours(wed(8, 59))).toBe(false)
    expect(isWorkingHours(wed(17, 30))).toBe(false)
    expect(isWorkingHours(wed(19, 0))).toBe(false)
  })
  it('weekend is never working hours', () => {
    expect(isWorkingHours(sat(12, 0))).toBe(false)
  })
})

describe('isFamilyHours', () => {
  it('is the complement of working hours', () => {
    expect(isFamilyHours(wed(19, 0))).toBe(true)
    expect(isFamilyHours(sat(12, 0))).toBe(true)
    expect(isFamilyHours(wed(10, 0))).toBe(false)
  })
})
