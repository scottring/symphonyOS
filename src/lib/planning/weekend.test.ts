import { describe, expect, it } from 'vitest'
import { weekendStartFor, inTaskWeekend, weekendLabel, weekendPlacement } from './weekend'
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
