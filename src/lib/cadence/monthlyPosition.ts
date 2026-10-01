//
// Monthly by POSITION rather than by date: "the first weekend of the month",
// "the last Friday". A wash-the-comforters chore belongs on a weekend, and the
// 1st of the month lands on a Tuesday as often as not (Scott, 2026-10-01).
//
// A weekday position is one day. A weekend position is a WINDOW, exactly like
// the `weekend` recurrence: the month's nth Saturday plus the Sunday after it,
// grown through any federal day off that touches them (weekendWindowFor) —
// once across the window, so ticking it Saturday settles Sunday. "First
// weekend" means the first SATURDAY that falls in the month; a month that
// opens on a Sunday leaves that Sunday to the previous month's last weekend.
//

import type { MonthDayOfWeek, MonthWeek, RecurrencePattern } from '@/types/actionable'
import { weekendWindowFor } from './weekendWindow'

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

export const MONTH_WEEKS: readonly MonthWeek[] = [1, 2, 3, 4, -1]
export const MONTH_DAYS_OF_WEEK: readonly MonthDayOfWeek[] = ['weekend', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

const ORDINAL_WORDS: Record<string, string> = { '1': 'first', '2': 'second', '3': 'third', '4': 'fourth', '-1': 'last' }
const DAY_WORDS: Record<MonthDayOfWeek, string> = {
  weekend: 'weekend', sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday',
  thu: 'Thursday', fri: 'Friday', sat: 'Saturday',
}

export function monthWeekWord(n: MonthWeek): string {
  return ORDINAL_WORDS[String(n)]
}

export function monthDayWord(d: MonthDayOfWeek): string {
  return DAY_WORDS[d]
}

export type PositionedPattern = RecurrencePattern & { week_of_month: MonthWeek; day_of_week: MonthDayOfWeek }

/** A monthly rule set by position. Position wins over day_of_month when both are present. */
export function hasMonthlyPosition(p: RecurrencePattern | null | undefined): p is PositionedPattern {
  return p?.type === 'monthly' && MONTH_WEEKS.includes(p.week_of_month as MonthWeek) && !!p.day_of_week && p.day_of_week in DAY_WORDS
}

/**
 * A monthly or quarterly rule that names no day at all — a "flexible" month,
 * placed by hand when planning. A positioned rule names its day.
 */
export function leavesMonthDayOpen(p: RecurrencePattern): boolean {
  return (p.type === 'monthly' || p.type === 'quarterly') && !p.day_of_month && !hasMonthlyPosition(p)
}

/** "first weekend", "last Friday". */
export function describeMonthlyPosition(p: PositionedPattern): string {
  return `${monthWeekWord(p.week_of_month)} ${monthDayWord(p.day_of_week)}`
}

/** The nth <weekday> (0 = Sunday) of a month. `n = -1` means the last one. Month may overflow. */
export function nthWeekdayInMonth(year: number, month: number, weekday: number, n: MonthWeek): Date {
  const first = new Date(year, month, 1)
  const y = first.getFullYear()
  const m = first.getMonth()
  if (n === -1) {
    const last = new Date(y, m + 1, 0)
    const back = (last.getDay() - weekday + 7) % 7
    return new Date(y, m, last.getDate() - back)
  }
  const forward = (weekday - first.getDay() + 7) % 7
  return new Date(y, m, 1 + forward + (n - 1) * 7)
}

/**
 * The day(s) the position covers in one month, earliest first: a single day,
 * or the weekend window anchored on that month's nth Saturday (which can run
 * into the next month — the last Saturday of October may have its Sunday in
 * November — or start in the previous one through a holiday Friday).
 */
export function monthlyPositionDays(year: number, month: number, p: PositionedPattern): Date[] {
  if (p.day_of_week === 'weekend') {
    const saturday = nthWeekdayInMonth(year, month, 6, p.week_of_month)
    return weekendWindowFor(saturday)?.days
      ?? [saturday, new Date(saturday.getFullYear(), saturday.getMonth(), saturday.getDate() + 1)]
  }
  return [nthWeekdayInMonth(year, month, DAY_KEYS.indexOf(p.day_of_week), p.week_of_month)]
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** The occurrence (its day or window) containing `date`, or null when the date is not one. */
export function monthlyPositionWindowFor(date: Date, p: PositionedPattern): Date[] | null {
  // A window can spill a day or two across a month boundary either way.
  for (const offset of [0, -1, 1]) {
    const days = monthlyPositionDays(date.getFullYear(), date.getMonth() + offset, p)
    if (days.some((d) => sameDay(d, date))) return days
  }
  return null
}

/** The first occurrence whose last day is on or after `from` (midnight-normalised). */
export function nextMonthlyPositionWindow(p: PositionedPattern, from: Date): Date[] {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  for (let offset = -1; offset < 14; offset++) {
    const days = monthlyPositionDays(start.getFullYear(), start.getMonth() + offset, p)
    if (days[days.length - 1].getTime() >= start.getTime()) return days
  }
  // Unreachable: every month has a first through fourth and a last of everything.
  return monthlyPositionDays(start.getFullYear(), start.getMonth() + 1, p)
}
