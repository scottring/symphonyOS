// src/lib/week/weekStartParam.ts
//
// /week keeps the days it is showing in the URL (S2-25). The rule lives here
// rather than inline in HomeView so the writer and the reader are tested
// together and cannot drift.

import { localYmd, parseLocalYmd, weekStartAnchor, type WeekStart } from '@/lib/cadence/config'
import { buildRange, MAX_RANGE_DAYS, presetRange, weekRange, weekRangeFromStartParam } from '@/lib/planning/dateRange'
import type { HomeViewType } from '@/types/homeView'

/**
 * The search string /week should carry after moving to the run of
 * `rangeDays` days starting at `weekAnchor`, or `null` when the URL should be
 * left alone.
 *
 * A calendar week is `start` alone — its length and alignment are implied, and
 * that is the shape planning nudges already link to. Any other run (a weekend,
 * three days, a custom Thu–Wed) also carries `range` and `days`, because
 * `start` alone would reopen it as the full week around that day. Without
 * them a paged weekend came back as this weekend and a custom run as a week.
 *
 * `weekStartsOn` decides whether a seven-day run IS the calendar week; left
 * out, every seven-day run is treated as one (the original contract).
 * Views other than /week do not read `start` on arrival, so writing it there
 * would be a parameter nothing honours.
 */
export function weekStartParam(
  view: HomeViewType | undefined,
  rangeDays: number,
  search: string,
  weekAnchor: Date,
  weekStartsOn?: WeekStart,
  today?: Date,
): URLSearchParams | null {
  if (view !== 'week') return null
  const next = new URLSearchParams(search)
  next.set('start', localYmd(weekAnchor))
  const calendarWeek = rangeDays === 7
    && (weekStartsOn === undefined || localYmd(weekStartAnchor(weekAnchor, weekStartsOn)) === localYmd(weekAnchor))
  if (calendarWeek) {
    // A range kind left over from an earlier run would outvote `start` on the
    // way back in.
    next.delete('range')
    next.delete('days')
    // The current week, like Today's today, is the page with no date in its
    // URL: written in, it would outlive the week (Scott, 2026-10-12).
    if (today && weekStartsOn !== undefined && localYmd(weekStartAnchor(today, weekStartsOn)) === localYmd(weekAnchor)) {
      next.delete('start')
      next.delete('date')
    }
    return next
  }
  // The kind names the run the way the Week range menu does, so the menu shows
  // the right choice; `days` is what actually rebuilds it.
  const kind = rangeDays === 2 && weekAnchor.getDay() === 6 ? 'weekend'
    : rangeDays === 3 ? 'three'
    : 'custom'
  next.set('range', kind)
  next.set('days', String(rangeDays))
  return next
}

/**
 * The days /week opens on for this URL — the reader for `weekStartParam`.
 *
 * `start` + `days` is an exact run. `start` alone is the calendar week around
 * it. With no `start`, `?range=weekend | three` is the next such run from
 * `today`, and anything else is this week.
 */
export function weekRangeFromParams(params: URLSearchParams, weekStartsOn: WeekStart, today: Date): Date[] {
  const start = params.get('start')
  const days = Number(params.get('days'))
  if (start && /^\d{4}-\d{2}-\d{2}$/.test(start) && Number.isInteger(days) && days >= 1 && days <= MAX_RANGE_DAYS) {
    const first = parseLocalYmd(start)
    if (!Number.isNaN(first.getTime())) {
      const last = new Date(first)
      last.setDate(last.getDate() + days - 1)
      return buildRange(first, last)
    }
  }
  const range = params.get('range')
  return weekRangeFromStartParam(start, weekStartsOn)
    ?? (range === 'weekend' || range === 'three'
      ? presetRange(range, today)
      : weekRange(today, weekStartsOn))
}

/**
 * A URL that names the current calendar week (`start`, and the `date` that
 * rides with it) is cleaned to the bare page, so it keeps showing the current
 * week after this one ends. Null when there is nothing to clean: no start, a
 * past or future week, or an exact run (`days`).
 */
export function currentWeekCleanup(search: string, weekStartsOn: WeekStart, today: Date): URLSearchParams | null {
  const params = new URLSearchParams(search)
  const start = params.get('start')
  if (!start || params.get('days') || params.get('range')) return null
  const shown = weekRangeFromStartParam(start, weekStartsOn)
  if (!shown || localYmd(shown[0]) !== localYmd(weekStartAnchor(today, weekStartsOn))) return null
  params.delete('start')
  const date = params.get('date')
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date) && localYmd(weekStartAnchor(parseLocalYmd(date), weekStartsOn)) === localYmd(shown[0])) params.delete('date')
  return params
}
