// The Meals page's week follows the household's week start (2026-10-24, Scott:
// "the meal plan week should start on saturday ... that should probably be a
// choice in settings"; it is, Settings → Planning rhythm). Storage does not
// move: a meal is still filed under the Sunday week its date falls in
// (meal_plans.week_start, day_of_week = Date.getDay()), which the iPhone app,
// the wall and Symphony's chat all read by date. A Saturday-start week on the
// page is simply drawn from the two Sunday weeks it overlaps.
//
// The page works in POSITIONS, 0..6 from the window's first day, so the grid,
// its moves and "leftovers tomorrow" need no day-of-week arithmetic. With a
// Sunday start a position is the day of the week, exactly as before.

import { sundayOfWeek, toIsoDate } from '@/lib/weekHelpers'

const addDays = (d: Date, n: number) => {
  const next = new Date(d)
  next.setDate(next.getDate() + n)
  next.setHours(0, 0, 0, 0)
  return next
}

/** The date at a position in the window. */
export function dateAtPosition(windowStart: Date, position: number): Date {
  return addDays(windowStart, position)
}

/** Where a position is stored: its Sunday week and its day of the week. */
export function storageFor(windowStart: Date, position: number): { weekStart: string; dayOfWeek: number } {
  const date = dateAtPosition(windowStart, position)
  return { weekStart: toIsoDate(sundayOfWeek(date)), dayOfWeek: date.getDay() }
}

/** The position a stored meal takes in the window, or null when its date is
 *  outside it (the other end of a Sunday week the window only partly covers). */
export function positionOf(windowStart: Date, weekStart: string, dayOfWeek: number): number | null {
  const [y, m, d] = weekStart.slice(0, 10).split('-').map(Number)
  const date = new Date(y, m - 1, d + dayOfWeek)
  const start = addDays(windowStart, 0)
  // Math.round absorbs the hour a DST change adds or takes.
  const position = Math.round((date.getTime() - start.getTime()) / 86400000)
  return position >= 0 && position < 7 ? position : null
}

/** The Sunday weeks the window draws on (one, or two), and the one holding
 *  most of its days: that plan carries the window's range and its chat. */
export function windowWeeks(windowStart: Date): { weeks: string[]; anchor: string } {
  const weeks = [...new Set(Array.from({ length: 7 }, (_, i) => storageFor(windowStart, i).weekStart))]
  return { weeks, anchor: storageFor(windowStart, 3).weekStart }
}
