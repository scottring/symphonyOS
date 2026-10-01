import { describe, it, expect } from 'vitest'
import type { RecurrencePattern, Routine } from '@/types/actionable'
import {
  hasMonthlyPosition,
  leavesMonthDayOpen,
  monthlyPositionDays,
  monthlyPositionWindowFor,
  nextMonthlyPositionWindow,
  nthWeekdayInMonth,
  type PositionedPattern,
} from './monthlyPosition'
import { matchesRecurrenceForDate, namesDueDays } from '@/lib/routineUtils'

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const day = (s: string) => new Date(`${s}T00:00:00`)
const pos = (week_of_month: PositionedPattern['week_of_month'], day_of_week: PositionedPattern['day_of_week']): PositionedPattern =>
  ({ type: 'monthly', week_of_month, day_of_week })
const routine = (p: RecurrencePattern) => ({ id: 'r', recurrence_pattern: p }) as Routine

describe('nthWeekdayInMonth', () => {
  it('finds the first, fourth and last of a weekday', () => {
    expect(ymd(nthWeekdayInMonth(2026, 9, 6, 1))).toBe('2026-10-03') // first Sat, Oct 2026
    expect(ymd(nthWeekdayInMonth(2026, 9, 4, 4))).toBe('2026-10-22') // fourth Thu
    expect(ymd(nthWeekdayInMonth(2026, 9, 5, -1))).toBe('2026-10-30') // last Fri
  })
  it('handles a month overflow', () => {
    expect(ymd(nthWeekdayInMonth(2026, 12, 6, 1))).toBe('2027-01-02')
  })
})

describe('monthlyPositionDays — weekend windows', () => {
  it('a month that opens on a Saturday starts its first weekend on the 1st', () => {
    // Aug 1 2026 is a Saturday.
    expect(monthlyPositionDays(2026, 7, pos(1, 'weekend')).map(ymd)).toEqual(['2026-08-01', '2026-08-02'])
  })
  it('a month that opens on a Sunday leaves it to the previous month', () => {
    // Feb 1 2026 is a Sunday: the first weekend is the 7th–8th.
    expect(monthlyPositionDays(2026, 1, pos(1, 'weekend')).map(ymd)).toEqual(['2026-02-07', '2026-02-08'])
  })
  it('the last weekend can end in the next month', () => {
    // Oct 31 2026 is the last Saturday; its Sunday is Nov 1.
    expect(monthlyPositionDays(2026, 9, pos(-1, 'weekend')).map(ymd)).toEqual(['2026-10-31', '2026-11-01'])
  })
  it('grows through a Monday holiday like every weekend window', () => {
    // Labor Day, Mon Sep 7 2026.
    expect(monthlyPositionDays(2026, 8, pos(1, 'weekend')).map(ymd)).toEqual(['2026-09-05', '2026-09-06', '2026-09-07'])
  })
  it('can start in the previous month through a holiday Friday', () => {
    // Jan 1 2028 is a Saturday; New Year's is observed Fri Dec 31 2027.
    expect(monthlyPositionDays(2028, 0, pos(1, 'weekend')).map(ymd)).toEqual(['2027-12-31', '2028-01-01', '2028-01-02'])
  })
})

describe('monthlyPositionWindowFor / nextMonthlyPositionWindow', () => {
  it('finds the window across a month boundary', () => {
    expect(monthlyPositionWindowFor(day('2026-11-01'), pos(-1, 'weekend'))?.map(ymd)).toEqual(['2026-10-31', '2026-11-01'])
    expect(monthlyPositionWindowFor(day('2026-11-01'), pos(1, 'weekend'))).toBeNull()
  })
  it('next window from mid-month is next month’s', () => {
    expect(nextMonthlyPositionWindow(pos(1, 'weekend'), day('2026-10-12')).map(ymd)).toEqual(['2026-11-07', '2026-11-08'])
  })
  it('inside a window, that window is next', () => {
    expect(nextMonthlyPositionWindow(pos(1, 'weekend'), day('2026-11-08')).map(ymd)).toEqual(['2026-11-07', '2026-11-08'])
  })
})

describe('hasMonthlyPosition / leavesMonthDayOpen', () => {
  it('only a monthly rule with both fields is positioned', () => {
    expect(hasMonthlyPosition(pos(1, 'weekend'))).toBe(true)
    expect(hasMonthlyPosition({ type: 'monthly', week_of_month: 1 })).toBe(false)
    expect(hasMonthlyPosition({ type: 'weekly', week_of_month: 1, day_of_week: 'sat' })).toBe(false)
  })
  it('a positioned month is not a flexible month', () => {
    expect(leavesMonthDayOpen({ type: 'monthly' })).toBe(true)
    expect(leavesMonthDayOpen({ type: 'quarterly' })).toBe(true)
    expect(leavesMonthDayOpen({ type: 'monthly', day_of_month: 3 })).toBe(false)
    expect(leavesMonthDayOpen(pos(1, 'weekend'))).toBe(false)
  })
})

describe('matchesRecurrenceForDate — monthly by position', () => {
  const firstWeekend = routine(pos(1, 'weekend'))

  it('is due on both days of the first weekend and nowhere else', () => {
    const due: string[] = []
    for (let d = day('2026-11-01'); d < day('2026-12-01'); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      if (matchesRecurrenceForDate(firstWeekend, d, null)) due.push(ymd(d))
    }
    expect(due).toEqual(['2026-11-07', '2026-11-08'])
  })

  it('done on Saturday settles Sunday; Saturday still shows it, ticked', () => {
    const doneSat = new Date('2026-11-07T10:00:00')
    expect(matchesRecurrenceForDate(firstWeekend, day('2026-11-07'), doneSat)).toBe(true)
    expect(matchesRecurrenceForDate(firstWeekend, day('2026-11-08'), doneSat)).toBe(false)
  })

  it('last month’s completion does not settle this month', () => {
    expect(matchesRecurrenceForDate(firstWeekend, day('2026-11-08'), new Date('2026-10-04T10:00:00'))).toBe(true)
  })

  it('a weekday position is one day', () => {
    const lastFriday = routine(pos(-1, 'fri'))
    expect(matchesRecurrenceForDate(lastFriday, day('2026-10-30'), null)).toBe(true)
    expect(matchesRecurrenceForDate(lastFriday, day('2026-10-23'), null)).toBe(false)
    expect(matchesRecurrenceForDate(lastFriday, day('2026-10-31'), null)).toBe(false)
  })

  it('position wins over a leftover day_of_month', () => {
    const r = routine({ ...pos(1, 'weekend'), day_of_month: 1 })
    expect(matchesRecurrenceForDate(r, day('2026-10-01'), null)).toBe(false)
    expect(matchesRecurrenceForDate(r, day('2026-10-03'), null)).toBe(true)
  })

  it('names its day only when it is a weekday position', () => {
    expect(namesDueDays(pos(1, 'weekend'))).toBe(false)
    expect(namesDueDays(pos(2, 'tue'))).toBe(true)
  })
})

describe('matchesRecurrenceForDate — monthly by date', () => {
  it('a 31st rule falls on the last day of a shorter month', () => {
    const r = routine({ type: 'monthly', day_of_month: 31 })
    expect(matchesRecurrenceForDate(r, day('2026-09-30'), null)).toBe(true)
    expect(matchesRecurrenceForDate(r, day('2026-09-29'), null)).toBe(false)
    expect(matchesRecurrenceForDate(r, day('2026-10-31'), null)).toBe(true)
    expect(matchesRecurrenceForDate(r, day('2026-10-30'), null)).toBe(false)
  })
  it('a flexible month is never due by itself', () => {
    expect(matchesRecurrenceForDate(routine({ type: 'monthly' }), day('2026-10-01'), null)).toBe(false)
  })
})
