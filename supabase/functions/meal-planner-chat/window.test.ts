import { describe, expect, it } from 'vitest'
import { dateInWindow, dayInWindow, dayLabel, slotDay, windowWeeks } from './window'
import { resolveDate, weekOf } from '../_shared/mealDays'

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

  it('addresses a day by its date, as Symphony\'s meal tools do, stored under its Sunday week', () => {
    expect(slotDay('2026-10-24', { date: '2026-10-24' })).toEqual({ date: '2026-10-24', week: '2026-10-18', dayOfWeek: 6 })
    expect(slotDay('2026-10-24', { date: '2026-10-30' })).toEqual({ date: '2026-10-30', week: '2026-10-25', dayOfWeek: 5 })
  })

  it('agrees with Symphony\'s meal tools on where a date is stored', () => {
    for (const date of ['2026-10-24', '2026-10-25', '2026-10-30']) {
      const day = slotDay('2026-10-24', { date })
      const { weekStart, dayOfWeek } = weekOf(resolveDate(date, '2026-10-24')!)
      expect(day).toMatchObject({ week: weekStart, dayOfWeek })
    }
  })

  it('still takes a weekday from an older conversation', () => {
    expect(slotDay('2026-10-24', { day_of_week: 0 })).toEqual({ date: '2026-10-25', week: '2026-10-25', dayOfWeek: 0 })
  })

  it('refuses a date outside the week, a bad date, a date that contradicts its weekday, and no day at all', () => {
    expect(slotDay('2026-10-24', { date: '2026-10-31' })).toEqual({ error: expect.stringContaining('outside the week') })
    expect(slotDay('2026-10-24', { date: '2026-02-30' })).toEqual({ error: 'Error: date must be YYYY-MM-DD.' })
    expect(slotDay('2026-10-24', { date: '2026-10-24', day_of_week: 0 })).toEqual({ error: expect.stringContaining('is a Saturday') })
    expect(slotDay('2026-10-24', { day_of_week: true })).toEqual({ error: expect.stringContaining('integer 0-6') })
    expect(slotDay('2026-10-24', {})).toEqual({ error: expect.stringContaining('give the date') })
  })
})
