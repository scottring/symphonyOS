import { describe, expect, it } from 'vitest'
import { dateInWindow, dayInWindow, dayLabel, windowWeeks } from './window'

describe('meal chat window', () => {
  it('a Saturday week: each weekday names one date, stored under its Sunday week', () => {
    expect(dayInWindow('2026-10-24', 6)).toEqual({ date: '2026-10-24', week: '2026-10-18' })
    expect(dayInWindow('2026-10-24', 0)).toEqual({ date: '2026-10-25', week: '2026-10-25' })
    expect(dayInWindow('2026-10-24', 5)).toEqual({ date: '2026-10-30', week: '2026-10-25' })
    expect(windowWeeks('2026-10-24')).toEqual({ weeks: ['2026-10-18', '2026-10-25'], anchor: '2026-10-25' })
  })

  it('leaves out stored days outside the window', () => {
    expect(dateInWindow('2026-10-24', '2026-10-18', 6)).toBe('2026-10-24')
    expect(dateInWindow('2026-10-24', '2026-10-18', 5)).toBeNull()
    expect(dateInWindow('2026-10-24', '2026-10-25', 6)).toBeNull()
  })

  it('a Sunday week is the stored week itself', () => {
    expect(windowWeeks('2026-10-25')).toEqual({ weeks: ['2026-10-25'], anchor: '2026-10-25' })
    expect(dayInWindow('2026-10-25', 6)).toEqual({ date: '2026-10-31', week: '2026-10-25' })
  })

  it('names a day with its date', () => {
    expect(dayLabel('2026-10-24')).toBe('Saturday Oct 24')
  })
})
