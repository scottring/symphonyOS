/**
 * The span of days the planning grid lays out.
 *
 * A three-day weekend or a school break is a VIEW, not a bucket. It used to be
 * a saved "span" with its own pool beside Week and Month, which asked you to
 * file work into a third place that Week already held — so the pool went and
 * the range stayed, here, where you actually lay the days out (Scott,
 * 2026-09-05).
 */

import { weekStartAnchor, type WeekStart } from '@/lib/cadence/config'

/** Seven columns is what the grid can read at desk width. Past that the days
 *  are stripes. */
export const MAX_RANGE_DAYS = 7

export type RangePreset = 'today' | 'weekend' | 'three' | 'week'

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

/** The consecutive days from `start` through `end`, inclusive.
 *
 *  An end before the start is a half-finished edit, not an instruction to
 *  render backwards — it collapses to the single day you named. */
export function buildRange(start: Date, end: Date): Date[] {
  const first = startOfDay(start)
  const last = startOfDay(end)
  const spanMs = last.getTime() - first.getTime()
  // Day-arithmetic through the DST boundaries, not 86.4e6 * n: an hour lost in
  // March would otherwise round a range short.
  const days = spanMs <= 0 ? 1 : Math.round(spanMs / 86400000) + 1
  const count = Math.min(days, MAX_RANGE_DAYS)
  return Array.from({ length: count }, (_, i) => addDays(first, i))
}

/** The named ranges worth one click. Every one starts at or after `today` —
 *  planning into a day that has already gone is the span version of a stale
 *  week placement. */
export function presetRange(preset: RangePreset, today: Date): Date[] {
  const start = startOfDay(today)
  switch (preset) {
    case 'today':
      return buildRange(start, start)
    case 'three':
      return buildRange(start, addDays(start, 2))
    case 'week':
      return buildRange(start, addDays(start, MAX_RANGE_DAYS - 1))
    case 'weekend': {
      const dow = start.getDay() // 0 Sun … 6 Sat
      // A Sunday's own weekend is nearly over — the useful answer is the
      // COMING Saturday–Sunday, not a one-day "weekend" that reads as a
      // single labelled DAY on the masthead (demo run 2026-09-06).
      if (dow === 0) {
        const saturday = addDays(start, 6)
        return buildRange(saturday, addDays(saturday, 1))
      }
      const saturday = addDays(start, (6 - dow + 7) % 7)
      return buildRange(saturday, addDays(saturday, 1))
    }
  }
}

/** The calendar week containing `today`, anchored to the configured week
 *  start. This is what "This week" means on /week — the week list's week —
 *  as opposed to the rolling seven days a `'week'` preset gives a grid opened
 *  mid-week. */
export function weekRange(today: Date, weekStartsOn: WeekStart): Date[] {
  const start = weekStartAnchor(today, weekStartsOn)
  return buildRange(start, addDays(start, 6))
}

/** The weeks a range touches OTHER than the current one, as week-start dates.
 *  The list beside the grid is always this week's plan; each of these gets its
 *  placed rows folded beneath it, so a weekend that spills into Sunday, or a
 *  range parked wholly in a future week, still shows what is planned there. */
export function foldWeeksFor(rangeStart: Date, dayCount: number, today: Date, weekStartsOn: WeekStart): Date[] {
  const current = weekStartAnchor(today, weekStartsOn).getTime()
  const seen = new Set<number>()
  const out: Date[] = []
  for (let i = 0; i < dayCount; i++) {
    const w = weekStartAnchor(addDays(rangeStart, i), weekStartsOn)
    const t = w.getTime()
    if (t === current || seen.has(t)) continue
    seen.add(t)
    out.push(w)
  }
  return out
}
