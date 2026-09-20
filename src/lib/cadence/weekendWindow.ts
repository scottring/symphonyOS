//
// What counts as "the weekend", including long ones.
//
// A routine set to the weekend is one commitment with a window, not one
// occurrence per day: "either day, rather than always being shown on Saturday
// or Sunday" (Scott, 2026-09-20). This module decides the window's days; the
// once-per-window completion is the caller's business.
//
// The days off are COMPUTED, not read from the subscribed holiday calendar.
// That calendar carries Valentine's Day, Halloween, Tax Day and the daylight
// saving switch alongside the real ones, and none of those make a Monday a day
// off. The federal list is a fixed rule set, so this works offline, needs no
// fetch, and gives the same answer on the wall, on the phone and in a test.
//

/** Federal holidays that are actually days off. Not Valentine's Day. */
export type FederalHoliday =
  | "New Year's Day"
  | 'Martin Luther King Jr. Day'
  | 'Presidents’ Day'
  | 'Memorial Day'
  | 'Juneteenth'
  | 'Independence Day'
  | 'Labor Day'
  | 'Columbus Day'
  | 'Veterans Day'
  | 'Thanksgiving'
  | 'Day after Thanksgiving'
  | 'Christmas Day'

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** The nth <weekday> of a month. `n = -1` means the last one. */
function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  if (n === -1) {
    const last = new Date(year, month + 1, 0)
    const back = (last.getDay() - weekday + 7) % 7
    return new Date(year, month, last.getDate() - back)
  }
  const first = new Date(year, month, 1)
  const forward = (weekday - first.getDay() + 7) % 7
  return new Date(year, month, 1 + forward + (n - 1) * 7)
}

/** A fixed-date holiday moves to Friday when it lands on a Saturday and to
 *  Monday when it lands on a Sunday — which is itself a long-weekend maker. */
function observed(d: Date): Date {
  if (d.getDay() === 6) return new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1)
  if (d.getDay() === 0) return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
  return d
}

/** Every federal day off in `year`, as YYYY-MM-DD → name. */
const daysOffByYear = new Map<number, Map<string, FederalHoliday>>()

export function federalDaysOff(year: number): Map<string, FederalHoliday> {
  const cached = daysOffByYear.get(year)
  if (cached) return cached
  const built = buildFederalDaysOff(year)
  daysOffByYear.set(year, built)
  return built
}

/** The table changes once a year; build it once a year. */
function buildFederalDaysOff(year: number): Map<string, FederalHoliday> {
  const thanksgiving = nthWeekday(year, 10, 4, 4) // 4th Thursday in November
  const dayAfter = new Date(year, 10, thanksgiving.getDate() + 1)
  const entries: [Date, FederalHoliday][] = [
    [observed(new Date(year, 0, 1)), "New Year's Day"],
    [nthWeekday(year, 0, 1, 3), 'Martin Luther King Jr. Day'],
    [nthWeekday(year, 1, 1, 3), 'Presidents’ Day'],
    [nthWeekday(year, 4, 1, -1), 'Memorial Day'],
    [observed(new Date(year, 5, 19)), 'Juneteenth'],
    [observed(new Date(year, 6, 4)), 'Independence Day'],
    [nthWeekday(year, 8, 1, 1), 'Labor Day'],
    [nthWeekday(year, 9, 1, 2), 'Columbus Day'],
    [observed(new Date(year, 10, 11)), 'Veterans Day'],
    [thanksgiving, 'Thanksgiving'],
    [dayAfter, 'Day after Thanksgiving'],
    [observed(new Date(year, 11, 25)), 'Christmas Day'],
  ]
  return new Map(entries.map(([d, name]) => [ymd(d), name]))
}

/** Is this a federal day off? Spans the year boundary (Jan 1 observed on
 *  Dec 31 belongs to the next year's list). */
export function isFederalDayOff(date: Date): boolean {
  const y = date.getFullYear()
  const key = ymd(date)
  return federalDaysOff(y).has(key) || federalDaysOff(y + 1).has(key)
}

function isWeekendDay(date: Date): boolean {
  const d = date.getDay()
  return d === 0 || d === 6
}

function addDays(date: Date, n: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n)
}

export interface WeekendWindow {
  /** Every day in the window, earliest first. */
  days: Date[]
  start: Date
  end: Date
}

/**
 * The weekend `date` belongs to, or null if it belongs to none.
 *
 * The core is the Saturday and Sunday. The window then grows outward through
 * days off that TOUCH it: the Friday before, the Monday after, and onward — so
 * Thanksgiving Thursday, its Friday and the weekend are one window, and a
 * Monday holiday makes a three-day one. A day off that stands alone in
 * midweek (Veterans Day on a Wednesday) is not a weekend and gets null.
 */
export function weekendWindowFor(date: Date): WeekendWindow | null {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate())

  // Find the window's Saturday. From a weekend day it is here or just behind;
  // from a day off it is whichever side an unbroken run of days off reaches.
  let saturday: Date | null = null
  if (day.getDay() === 6) saturday = day
  else if (day.getDay() === 0) saturday = addDays(day, -1)
  else if (isFederalDayOff(day)) {
    // Walk forward through days off looking for a Saturday…
    for (let i = 1; i <= 4; i++) {
      const ahead = addDays(day, i)
      if (ahead.getDay() === 6) { saturday = ahead; break }
      if (!isFederalDayOff(ahead)) break
    }
    // …then backward, for a Monday (or later) holiday after a weekend.
    if (!saturday) {
      for (let i = 1; i <= 4; i++) {
        const behind = addDays(day, -i)
        if (behind.getDay() === 0) { saturday = addDays(behind, -1); break }
        if (!isFederalDayOff(behind)) break
      }
    }
  }
  if (!saturday) return null

  let start = saturday
  while (isFederalDayOff(addDays(start, -1))) start = addDays(start, -1)
  let end = addDays(saturday, 1) // Sunday
  while (isFederalDayOff(addDays(end, 1))) end = addDays(end, 1)

  const days: Date[] = []
  for (let d = start; d.getTime() <= end.getTime(); d = addDays(d, 1)) days.push(d)
  return { days, start, end }
}

/** Is `date` inside a weekend (long ones included)? */
export function isWeekendWindowDay(date: Date): boolean {
  return isWeekendDay(date) || weekendWindowFor(date) !== null
}

/** The window's days as YYYY-MM-DD — what an instance row is keyed by. */
export function weekendWindowKeys(date: Date): string[] {
  return weekendWindowFor(date)?.days.map(ymd) ?? []
}
