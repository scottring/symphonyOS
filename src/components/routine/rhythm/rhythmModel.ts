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
    /** Resting (asleep) weekly routines, ghosted into their day columns. */
    restingDays: Record<DayKey, Routine[]>
  }
  sometimes: Routine[]
  seasonal: Routine[]
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

/** Which zone a recurrence pattern belongs to. Weekly with >=5 days is daily-ish. */
function zoneOf(p: RecurrencePattern): 'daily' | 'week' | 'sometimes' {
  if (p.type === 'daily') return 'daily'
  if (p.type === 'weekly') {
    if (p.days && p.days.length >= 5) return 'daily'
    return 'week'
  }
  return 'sometimes'
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
  opts: { memberId?: string | null } = {},
): RhythmModel {
  const { collections, standalone } = groupRoutineSteps(routines)
  const stepCounts: Record<string, number> = {}
  for (const c of collections) stepCounts[c.id] = c.steps.length

  const memberId = opts.memberId ?? null
  const keep = (r: Routine, steps: Routine[] = []): boolean => {
    if (!memberId) return true
    return [r, ...steps].some(x => memberIdsOf(x).includes(memberId))
  }

  const topLevel: { routine: Routine; steps: Routine[] }[] = [
    ...collections.filter(c => keep(c, c.steps)).map(c => ({ routine: c as Routine, steps: c.steps })),
    ...standalone.filter(r => keep(r)).map(r => ({ routine: r, steps: [] as Routine[] })),
  ]

  const emptyDays = (): Record<DayKey, Routine[]> =>
    ({ sun: [], mon: [], tue: [], wed: [], thu: [], fri: [], sat: [] })

  const model: RhythmModel = {
    daily: { timed: [], anytime: [] },
    week: { days: emptyDays(), sometime: [], restingDays: emptyDays() },
    sometimes: [],
    seasonal: [],
    stepCounts,
  }

  const looseTimedDaily: Routine[] = []

  for (const { routine, steps } of topLevel) {
    if (routine.visibility === 'reference') {
      model.seasonal.push(routine)
      // Weekly sleepers also ghost into their day column for one-tap wake.
      if (zoneOf(routine.recurrence_pattern) === 'week') {
        for (const d of weekDaysFor(routine)) model.week.restingDays[d].push(routine)
      }
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
    } else {
      model.sometimes.push(routine)
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
    if (card.kind === 'cluster' && current.length >= 3) {
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
