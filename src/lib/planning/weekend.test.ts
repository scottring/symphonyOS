import { describe, expect, it } from 'vitest'
import { weekendStartFor, inTaskWeekend, weekendLabel, weekendPlacement, weekendsTouching, weekendRangeLabel } from './weekend'
import { localYmd } from '@/lib/cadence/config'

describe('flexible weekend', () => {
  it.each([[22, 26], [26, 26], [27, 26], [28, 3]])('resolves September %s without pushing Sunday into next weekend', (day, expected) => {
    const start = weekendStartFor(new Date(2026, 8, day, 16))
    expect(start.getDate()).toBe(expected)
    expect(start.getHours()).toBe(0)
  })
  it('uses Saturday in the displayed week on Week, with explicit dates', () => {
    const start = weekendStartFor(new Date(2026, 8, 22), new Date(2026, 9, 4))
    expect(localYmd(start)).toBe('2026-10-10')
    expect(weekendLabel(start)).toBe('Weekend · Oct 10–Oct 11')
  })
  it('covers both days through DST and stops on Monday', () => {
    const task = { weekendStart: new Date(2026, 9, 31) }
    expect(inTaskWeekend(task, new Date(2026, 9, 31))).toBe(true)
    expect(inTaskWeekend(task, new Date(2026, 10, 1, 23))).toBe(true)
    expect(inTaskWeekend(task, new Date(2026, 10, 2))).toBe(false)
  })
})

it('flexible placement clears a former Saturday date and leaves broader commitments untouched', () => {
  const update = weekendPlacement(new Date(2026, 8, 26, 15))
  expect(update.bucket).toBe('week')
  expect(localYmd(update.weekendStart!)).toBe('2026-09-26')
  expect(update).toHaveProperty('scheduledFor', undefined)
  expect(update).toHaveProperty('plannedOn', undefined)
  expect(update).not.toHaveProperty('monthStart')
  expect(update).not.toHaveProperty('commitments')
})

describe('the weekends a month offers', () => {
  const ymds = (d: Date[]) => d.map(localYmd)
  it('September 2026: the four Saturdays inside it', () => {
    expect(ymds(weekendsTouching(new Date(2026, 8, 10)))).toEqual(['2026-09-05', '2026-09-12', '2026-09-19', '2026-09-26'])
  })
  it('a weekend that straddles the month edge belongs to BOTH months', () => {
    // Sat Oct 31 – Sun Nov 1.
    expect(ymds(weekendsTouching(new Date(2026, 9, 1))).at(-1)).toBe('2026-10-31')
    expect(ymds(weekendsTouching(new Date(2026, 10, 1)))[0]).toBe('2026-10-31')
  })
  it('August 2026 starts on a Saturday and ends on a Monday', () => {
    expect(ymds(weekendsTouching(new Date(2026, 7, 20)))).toEqual(['2026-08-01', '2026-08-08', '2026-08-15', '2026-08-22', '2026-08-29'])
  })
  it('labels both days, naming both months across the edge', () => {
    expect(weekendRangeLabel(new Date(2026, 8, 12))).toBe('Sep 12–13')
    expect(weekendRangeLabel(new Date(2026, 9, 31))).toBe('Oct 31 – Nov 1')
  })
})
