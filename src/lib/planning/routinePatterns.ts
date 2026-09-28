// src/lib/planning/routinePatterns.ts
//
// The recurring commitments a PERIOD page shows for reference — patterns, not
// occurrences. Higher horizons show slower cadences due within the displayed
// period; day and week surfaces resolve individual occurrences separately.
//
// Pure, and deliberately so: the page's own test suite stubs matchesLayers to
// a pass-through, which silently neutered the domain lens when this filter
// lived inline in the component (review 2026-09-13).

import type { Routine } from '@/types/actionable'
import type { Layer } from '@/lib/domains'
import { resolveRoutineEligible, resolveRoutine } from '@/lib/routineUtils'
import { describeRecurrence } from '@/lib/quickRecurrence'

export interface RoutinePattern {
  id: string
  name: string
  /** The app's one cadence vocabulary — "Every week", "Monthly on the 3rd". */
  cadence: string
}

/** The routines worth showing beside a period's plan, in the given lens. The
 *  count a caller renders is this array's own length — there is no second
 *  query to disagree with it. */
export interface RoutineHorizon {
  level: 'month' | 'season' | 'year'
  start: Date
  end: Date // exclusive
}

function belongsToHorizon(r: Routine, horizon: RoutineHorizon, layers: ReadonlySet<Layer>): boolean {
  const p = r.recurrence_pattern
  const months = p.type === 'yearly' ? 12 * (p.interval ?? 1)
    : p.type === 'quarterly' ? 3 * (p.interval ?? 1)
    : p.type === 'monthly' || (p.type === 'since_last' && p.unit === 'months') ? (p.interval ?? 1)
    : 0
  const minimum = horizon.level === 'year' ? 12 : horizon.level === 'season' ? 3 : 1
  if (p.type !== 'specific_days' && months < minimum) return false
  // Relative-to-completion patterns need history to predict a due date. Keep
  // their cadence visible without inventing an occurrence.
  if (p.type === 'since_last') return true
  // Flexible monthly/quarterly patterns have no particular day to match.
  if ((p.type === 'monthly' || p.type === 'quarterly') && !p.day_of_month) return true
  for (const date = new Date(horizon.start); date < horizon.end; date.setDate(date.getDate() + 1)) {
    if (resolveRoutine(r, { date, prefs: { hideRoutines: false, layers } }).shows) return true
  }
  return false
}

export function routinePatterns(routines: readonly Routine[], layers: ReadonlySet<Layer>, horizon?: RoutineHorizon): RoutinePattern[] {
  return routines
    .filter((r) => resolveRoutineEligible(r, { prefs: { hideRoutines: false, layers } }).shows)
    .filter((r) => !horizon || belongsToHorizon(r, horizon, layers))
    .map((r) => ({ id: r.id, name: r.name, cadence: describeRecurrence(r.recurrence_pattern) }))
}

/** The horizon a routine's cadence belongs to. A daily rhythm lives on Today
 *  and is never a planning reference; a weekly one is the week's; monthly the
 *  month's; quarterly and yearly the season's. Specific dates belong to
 *  whichever period they fall in (null here — the caller checks the dates). */
export function routineHorizon(r: Routine): 'day' | 'week' | 'month' | 'season' | null {
  const p = r.recurrence_pattern
  switch (p.type) {
    case 'daily': return 'day'
    case 'weekly': case 'weekend': return 'week'
    case 'monthly': return 'month'
    case 'quarterly': case 'yearly': return 'season'
    case 'since_last': return p.unit === 'months' ? 'month' : p.unit === 'weeks' ? 'week' : (p.interval ?? 1) >= 7 ? 'week' : 'day'
    default: return null
  }
}

/**
 * The routines a horizon's reference column lists (Scott, 2026-09-28): only
 * the ones with NO set time — a weekly "kids tidy their rooms" on Sundays
 * with no hour is something to plan around; a 7:30 routine is already on the
 * clock and needs nothing from a planning meeting. Each is listed on its OWN
 * horizon only, and only when it falls inside the period. A collection's
 * steps ride with it and are never listed on their own.
 */
export function untimedRoutines(
  routines: readonly Routine[],
  layers: ReadonlySet<Layer>,
  horizon: { level: 'week' | 'month' | 'season'; start: Date; end: Date },
): RoutinePattern[] {
  return routines
    .filter((r) => !r.parent_routine_id && !r.time_of_day && !(r.times_per_day?.length))
    .filter((r) => resolveRoutineEligible(r, { prefs: { hideRoutines: false, layers } }).shows)
    .filter((r) => {
      const h = routineHorizon(r)
      if (h === 'day') return false
      if (h !== null && h !== horizon.level) return false
      const p = r.recurrence_pattern
      // No particular day to match: a flexible month, a relative rhythm.
      if (p.type === 'since_last' || ((p.type === 'monthly' || p.type === 'quarterly') && !p.day_of_month)) return h === horizon.level
      for (const date = new Date(horizon.start); date < horizon.end; date.setDate(date.getDate() + 1)) {
        if (resolveRoutine(r, { date, prefs: { hideRoutines: false, layers } }).shows) return true
      }
      return false
    })
    .map((r) => ({ id: r.id, name: r.name, cadence: describeRecurrence(r.recurrence_pattern) }))
}
