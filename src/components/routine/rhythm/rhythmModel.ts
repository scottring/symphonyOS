import type { Routine, RecurrencePattern } from '@/types/actionable'
import type { FamilyMember } from '@/types/family'
import { groupRoutineSteps } from '@/lib/today/routineCollections'

export type DayKey = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'
export const DAY_ORDER: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

export interface RhythmCard {
  kind: 'collection' | 'cluster' | 'single'
  id: string
  name: string | null
  startTime: string | null
  endTime: string | null
  routines: Routine[]
  suggestedName?: string
  /** The collection's own routine — carries card-level assignees (steps often have none). */
  routine?: Routine
}

export interface RhythmModel {
  daily: { timed: RhythmCard[]; anytime: Routine[] }
  week: {
    days: Record<DayKey, Routine[]>
    sometime: Routine[]
  }
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

const CLUSTER_GAP_MIN = 45

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

/** Day columns a weekly routine occupies: listed days, else the weekday
 * derived from start_date (biweekly patterns often carry only interval+start). */
function weekDaysFor(routine: Routine): DayKey[] {
  const days = (routine.recurrence_pattern.days ?? []) as DayKey[]
  const valid = days.filter(d => DAY_ORDER.includes(d))
  if (valid.length > 0) return valid
  const sd = routine.recurrence_pattern.start_date
  const derived = sd ? DAY_ORDER[new Date(`${sd}T00:00:00`).getDay()] : undefined
  return derived ? [derived] : []
}

function suggestName(startMinutes: number): string {
  if (startMinutes < 11 * 60) return 'Morning'
  if (startMinutes < 15 * 60) return 'Midday'
  if (startMinutes < 17.5 * 60) return 'After School'
  if (startMinutes < 19 * 60) return 'Evening'
  return 'Bedtime'
}

export function buildRhythmModel(
  routines: Routine[],
  opts: { memberIds?: readonly string[] | null; focusDay?: DayKey | null } = {},
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
  const focusDay = opts.focusDay ?? null
  const keep = (r: Routine, steps: Routine[] = []): boolean => {
    if (!memberIds || memberIds.length === 0) return true
    return [r, ...steps].some(x => memberIdsOf(x).some(id => memberIds.includes(id)))
  }

  const topLevel: { routine: Routine; steps: Routine[] }[] = [
    ...collections.filter(c => keep(c, c.steps)).map(c => ({ routine: c as Routine, steps: c.steps })),
    ...standalone.filter(r => keep(r)).map(r => ({ routine: r, steps: [] as Routine[] })),
  ]

  const emptyDays = (): Record<DayKey, Routine[]> =>
    ({ sun: [], mon: [], tue: [], wed: [], thu: [], fri: [], sat: [] })

  const model: RhythmModel = {
    daily: { timed: [], anytime: [] },
    week: { days: emptyDays(), sometime: [] },
    month: [],
    season: [],
    year: [],
    rare: [],
    resting: [],
    stepCounts,
  }

  const looseTimedDaily: Routine[] = []

  for (const { routine, steps } of topLevel) {
    if (routine.visibility === 'reference') {
      model.resting.push(routine)
      continue
    }
    const zone = zoneOf(routine.recurrence_pattern)
    if (zone === 'daily') {
      if (steps.length > 0) {
        model.daily.timed.push({
          kind: 'collection',
          id: routine.id,
          name: routine.name,
          startTime: routine.time_of_day,
          endTime: routine.time_of_day,
          routines: steps,
          routine,
        })
      } else if (routine.time_of_day) {
        looseTimedDaily.push(routine)
      } else {
        model.daily.anytime.push(routine)
      }
    } else if (zone === 'week') {
      const wd = weekDaysFor(routine)
      if (wd.length > 0) for (const d of wd) model.week.days[d].push(routine)
      else model.week.sometime.push(routine)
      // Focused day: that day's weekly routines ALSO join the arc, placed at
      // their times, so the arc becomes the full picture of the chosen day.
      if (focusDay && wd.includes(focusDay)) {
        if (steps.length > 0) {
          model.daily.timed.push({
            kind: 'collection',
            id: routine.id,
            name: routine.name,
            startTime: routine.time_of_day,
            endTime: routine.time_of_day,
            routines: steps,
            routine,
          })
        } else if (routine.time_of_day) {
          looseTimedDaily.push(routine)
        } else {
          model.daily.anytime.push(routine)
        }
      }
    } else {
      model[zone].push(routine)
    }
  }

  // Greedy time clustering of loose timed daily routines.
  looseTimedDaily.sort((a, b) => (minutesOf(a.time_of_day) ?? 0) - (minutesOf(b.time_of_day) ?? 0))
  let current: Routine[] = []
  const flush = () => {
    if (current.length === 0) return
    const start = current[0].time_of_day
    const end = current[current.length - 1].time_of_day
    const card: RhythmCard = {
      kind: current.length === 1 ? 'single' : 'cluster',
      id: current.length === 1 ? current[0].id : `cluster-${current[0].id}`,
      name: current.length === 1 ? current[0].name : null,
      startTime: start,
      endTime: end,
      routines: current,
    }
    if (card.kind === 'cluster') {
      card.suggestedName = suggestName(minutesOf(start) ?? 0)
    }
    model.daily.timed.push(card)
    current = []
  }
  for (const r of looseTimedDaily) {
    if (current.length === 0) { current = [r]; continue }
    const prev = minutesOf(current[current.length - 1].time_of_day) ?? 0
    const cur = minutesOf(r.time_of_day) ?? 0
    if (cur - prev > CLUSTER_GAP_MIN) flush()
    if (current.length === 0) current = [r]
    else current.push(r)
  }
  flush()

  model.daily.timed.sort(
    (a, b) => (minutesOf(a.startTime) ?? 24 * 60) - (minutesOf(b.startTime) ?? 24 * 60),
  )
  return model
}

/** Resolve a routine's assignees against the family roster (multi with legacy fallback). */
export function resolveMembers(r: Routine, familyMembers: FamilyMember[]): FamilyMember[] {
  return memberIdsOf(r)
    .map(id => familyMembers.find(m => m.id === id))
    .filter((m): m is FamilyMember => Boolean(m))
}
