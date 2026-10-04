import { describe, it, expect } from 'vitest'
import { wallMoment } from './wallMoment'

const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m) // Oct 2026; 6 = Tue, 10 = Sat

// Scott, 2026-10-04 (mockup "Wall, by time of day"): the wall's centre follows
// the day — out the door, after school, dinner, tomorrow's heads-up.
describe('wallMoment', () => {
  it('a school morning is out-the-door until 9', () => {
    expect(wallMoment(at(6, 6, 30), { schoolDay: true })).toBe('morning')
    expect(wallMoment(at(6, 8, 59), { schoolDay: true })).toBe('morning')
    expect(wallMoment(at(6, 9, 0), { schoolDay: true })).toBe('after')
  })

  it('a weekend morning runs later', () => {
    expect(wallMoment(at(10, 10, 30), { schoolDay: false })).toBe('morning')
    expect(wallMoment(at(10, 11, 0), { schoolDay: false })).toBe('after')
  })

  it('dinner starts 75 minutes before dinner time and runs to 7:30', () => {
    expect(wallMoment(at(6, 16, 44), { schoolDay: true })).toBe('after')
    expect(wallMoment(at(6, 16, 45), { schoolDay: true })).toBe('dinner')
    expect(wallMoment(at(6, 19, 29), { schoolDay: true })).toBe('dinner')
    expect(wallMoment(at(6, 18, 0), { schoolDay: true, dinnerAt: { h: 19, m: 0 } })).toBe('dinner')
    expect(wallMoment(at(6, 17, 30), { schoolDay: true, dinnerAt: { h: 19, m: 0 } })).toBe('after')
  })

  it('evening is tomorrow’s heads-up, through the night', () => {
    expect(wallMoment(at(6, 19, 30), { schoolDay: true })).toBe('evening')
    expect(wallMoment(at(6, 23, 0), { schoolDay: true })).toBe('evening')
    expect(wallMoment(at(7, 3, 0), { schoolDay: true })).toBe('evening')
    expect(wallMoment(at(7, 5, 0), { schoolDay: true })).toBe('morning')
  })
})
