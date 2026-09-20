import type { Routine, RecurrencePattern } from '@/types/actionable'
import type { FamilyMember } from '@/types/family'
import { groupRoutineSteps } from '@/lib/today/routineCollections'

export type DayKey = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'
export const DAY_ORDER: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

export interface RhythmModel {
  /** Every-day routines in the order the day runs — timed first by the clock,
   *  then the ones with no time. A list, not an arc: the arc's emptiness was
   *  horizontal and no constant fixed it (Scott, 2026-09-13). */
  daily: Routine[]
  /** Weekly routines, each ONCE. The day strip repeated a Tue/Thu/Sat routine
   *  into three columns; a row says "Tuesday, Thursday, Saturday" instead. */
  week: Routine[]
  /** The rungs past the week, each its own band (Scott, 2026-09-13: "monthly,
   *  seasonal, and yearly and also > year"). A twelve-month calendar could not
   *  show a MONTHLY routine — it belongs in every cell — so the ladder names
   *  the cadence instead of plotting it.
   *
   *  `resting` is the sleepers; this is the one file sanctioned to read
   *  `visibility` directly. */
  month: Routine[]
  season: Routine[]
  year: Routine[]
  /** Rarer than once a year — every third spring, every five years. */
  rare: Routine[]
  resting: Routine[]
  stepCounts: Record<string, number>
}

export function minutesOf(t: string | null): number | null {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

export function memberIdsOf(r: Routine): string[] {
  if (r.assigned_to_all && r.assigned_to_all.length > 0) return r.assigned_to_all
  return r.assigned_to ? [r.assigned_to] : []
}

export type Zone = 'daily' | 'week' | 'month' | 'season' | 'year' | 'rare'

const UNIT_DAYS: Record<string, number> = { days: 1, weeks: 7, months: 30 }

/** A rung from a span in days — the fallback for patterns that state a period
 *  rather than a calendar slot ('since_last'). */
function zoneForDays(days: number): Zone {
  if (days <= 1) return 'daily'
  if (days <= 10) return 'week'
  if (days <= 45) return 'month'
  if (days <= 150) return 'season'
  if (days <= 400) return 'year'
  return 'rare'
}

/** Which rung a recurrence belongs to.
 *
 *  Weekly with >=5 days is daily-ish. Every weekly pattern stays on the week
 *  rung whatever its interval — a biweekly routine still happens on a WEEKDAY,
 *  and the strip is what places it; bucketing it by its 14-day span would file
 *  it under Monthly, where it has no column to live in. */
export function zoneOf(p: RecurrencePattern): Zone {
  const every = p.interval && p.interval > 0 ? p.interval : 1
  switch (p.type) {
    case 'daily':
      return every <= 1 ? 'daily' : zoneForDays(every)
    case 'weekly':
      return p.days && p.days.length >= 5 && every <= 1 ? 'daily' : 'week'
    // Once a week, on a window rather than a named day — still the week rung.
    case 'weekend':
      return 'week'
    case 'monthly':
      return zoneForDays(30 * every)
    case 'quarterly':
      return zoneForDays(91 * every)
    case 'yearly':
      return every <= 1 ? 'year' : 'rare'
    case 'since_last':
      return zoneForDays(every * (UNIT_DAYS[p.unit ?? 'days'] ?? 1))
    case 'specific_days':
      // A list of dates: the rung is how far apart the nearest two fall, so a
      // "Feb 1, Aug 1" pattern reads as seasonal rather than annual.
      return specificDaysZone(p)
    default:
      return 'year'
  }
}

function specificDaysZone(p: RecurrencePattern): Zone {
  const times = (p.dates ?? [])
    .map((d) => new Date(`${d}T00:00:00`).getTime())
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b)
  if (times.length < 2) return 'year'
  let closest = Infinity
  for (let i = 1; i < times.length; i++) closest = Math.min(closest, times[i] - times[i - 1])
  return zoneForDays(closest / 86_400_000)
}

export function buildRhythmModel(
  routines: Routine[],
  opts: { memberIds?: readonly string[] | null } = {},
): RhythmModel {
  const { collections, standalone } = groupRoutineSteps(routines)
  const stepCounts: Record<string, number> = {}
  for (const c of collections) stepCounts[c.id] = c.steps.length

  // "Whose week" holds a SET of people, empty meaning everyone (Scott,
  // 2026-09-07). Several names selected reads as their weeks laid over each
  // other — a routine survives if ANY of them is on it. Intersecting would
  // answer a question nobody asked ("what do these two share?") and would
  // make the second click empty the page.
  const memberIds = opts.memberIds ?? null
  const keep = (r: Routine, steps: Routine[] = []): boolean => {
    if (!memberIds || memberIds.length === 0) return true
    return [r, ...steps].some(x => memberIdsOf(x).some(id => memberIds.includes(id)))
  }

  const topLevel: { routine: Routine; steps: Routine[] }[] = [
    ...collections.filter(c => keep(c, c.steps)).map(c => ({ routine: c as Routine, steps: c.steps })),
    ...standalone.filter(r => keep(r)).map(r => ({ routine: r, steps: [] as Routine[] })),
  ]

  const model: RhythmModel = {
    daily: [], week: [], month: [], season: [], year: [], rare: [], resting: [],
    stepCounts,
  }

  for (const { routine } of topLevel) {
    if (routine.visibility === 'reference') {
      model.resting.push(routine)
      continue
    }
    const zone = zoneOf(routine.recurrence_pattern)
    model[zone].push(routine)
  }

  // The day reads in order: timed by the clock, then whatever has no time.
  model.daily.sort((a, b) => {
    const am = minutesOf(a.time_of_day)
    const bm = minutesOf(b.time_of_day)
    if (am === null && bm === null) return a.name.localeCompare(b.name)
    if (am === null) return 1
    if (bm === null) return -1
    return am - bm
  })

  return model
}

/** Resolve a routine's assignees against the family roster (multi with legacy fallback). */
export function resolveMembers(r: Routine, familyMembers: FamilyMember[]): FamilyMember[] {
  return memberIdsOf(r)
    .map(id => familyMembers.find(m => m.id === id))
    .filter((m): m is FamilyMember => Boolean(m))
}
