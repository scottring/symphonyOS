// src/lib/planning/monthWeeks.ts
//
// The weeks a month's work can be planned into.
//
// Both existing routes to "a week" hardcode the week containing *now*: the
// month row's "Take it into week" calls `pushTask(id, 'week')`, and Shelves'
// "Plan for this week" anchors on today. So an October task could only ever be
// committed to a September week, and Scott could not find any way to put "Buy
// game tickets" into Oct 4–10 — because there wasn't one (2026-09-24).
//
// A week that straddles the boundary is included: Sep 27 – Oct 3 is a week you
// can genuinely do October work in, and leaving it out would make the first
// days of the month unplannable.

import { weekStartAnchor, type WeekStart } from '@/lib/cadence/config'

export interface MonthWeek {
  /** The week's anchor day, which is what `week_start` stores. */
  start: Date
  /** Inclusive last day, for the label only. */
  end: Date
  /** "Oct 4 – 10", or "Sep 27 – Oct 3" when the week crosses a month. */
  label: string
}

function addDays(d: Date, n: number): Date {
  const next = new Date(d)
  next.setDate(next.getDate() + n)
  return next
}

function labelFor(start: Date, end: Date): string {
  const month = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' })
  return start.getMonth() === end.getMonth()
    ? `${month(start)} ${start.getDate()} – ${end.getDate()}`
    : `${month(start)} ${start.getDate()} – ${month(end)} ${end.getDate()}`
}

/**
 * Every week that overlaps `monthStart`'s month, in order.
 *
 * `monthStart` is any day inside the month; the result is anchored to the
 * household's `weekStartsOn`, so the starts returned are exactly the values
 * `week_start` takes.
 */
export function weeksOfMonth(monthStart: Date, weekStartsOn: WeekStart): MonthWeek[] {
  const first = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1)
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0)

  const weeks: MonthWeek[] = []
  let start = weekStartAnchor(first, weekStartsOn)
  while (start <= monthEnd) {
    const end = addDays(start, 6)
    weeks.push({ start, end, label: labelFor(start, end) })
    start = addDays(start, 7)
  }
  return weeks
}
