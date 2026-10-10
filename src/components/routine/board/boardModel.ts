// src/components/routine/board/boardModel.ts
//
// The Routines board's arrangements (approved composition, 2026-10-10). Pure:
// it takes each top-level routine with its Steps and its "where it shows"
// explanation, and returns the bands to draw — never decides visibility (the
// explanation came from resolveRoutine) and never writes.
//
//   By time of day   Morning · Midday · Afternoon · Evening · Any time ·
//                    Weekly · Monthly & less often · Just mine · private
//   By person        one band per household member · Household · Unassigned
//   By where it shows Today · Kiosk · Week · Nowhere — each routine under the
//                    FIRST surface it shows on (Today, then Kiosk, then Week),
//                    so it appears once; its chips say the rest.
//
// In every arrangement, Resting and Off routines are not in the bands: they
// wait in "Not showing", folded, at the end.

import type { Routine } from '@/types/actionable'
import type { FamilyMember } from '@/types/family'
import { routineOwners } from '@/lib/routineUtils'
import type { RoutineExplanation } from '@/lib/routines/explain'
import { clockText, daysText } from '@/lib/routines/explain'
import { ruleSentence } from '@/lib/routineReadback'
import { minutesOf, zoneOf } from '../rhythm/rhythmModel'

/** dataTransfer type for drag-to-group on the board. */
export const ROUTINE_DRAG_TYPE = 'application/x-symphony-routine'

export type Arrangement = 'time' | 'person' | 'where'

export const ARRANGEMENTS: { id: Arrangement; label: string }[] = [
  { id: 'time', label: 'By time of day' },
  { id: 'person', label: 'By person' },
  { id: 'where', label: 'By where it shows' },
]

export interface BoardRoutine {
  routine: Routine
  steps: Routine[]
  explanation: RoutineExplanation
}

export interface Band {
  key: string
  label: string
  items: BoardRoutine[]
}

export interface BoardModel {
  bands: Band[]
  resting: BoardRoutine[]
  off: BoardRoutine[]
}

/** The hour a routine happens: its own, else its earliest Step's. */
export function boardMinutes(item: Pick<BoardRoutine, 'routine' | 'steps'>): number | null {
  const own = minutesOf(item.routine.time_of_day) ?? minutesOf(item.routine.times_per_day?.[0] ?? null)
  if (own != null) return own
  const stepTimes = item.steps.map((s) => minutesOf(s.time_of_day)).filter((m): m is number => m != null)
  return stepTimes.length ? Math.min(...stepTimes) : null
}

type TimeBandKey = 'morning' | 'midday' | 'afternoon' | 'evening' | 'anytime' | 'weekly' | 'monthly' | 'private'
const TIME_BANDS: { key: TimeBandKey; label: string }[] = [
  { key: 'morning', label: 'Morning' },
  { key: 'midday', label: 'Midday' },
  { key: 'afternoon', label: 'Afternoon' },
  { key: 'evening', label: 'Evening' },
  { key: 'anytime', label: 'Any time of day' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly & less often' },
  { key: 'private', label: 'Just mine · private' },
]

function timeBandOf(item: BoardRoutine): Exclude<TimeBandKey, 'private'> {
  const zone = zoneOf(item.routine.recurrence_pattern)
  if (zone === 'week') return 'weekly'
  if (zone !== 'daily') return 'monthly'
  const m = boardMinutes(item)
  if (m == null) return 'anytime'
  if (m < 11 * 60) return 'morning'
  if (m < 14 * 60) return 'midday'
  if (m < 17 * 60) return 'afternoon'
  return 'evening'
}

/** The viewer's own private routine: private to one person (the kiosk rule),
 *  and that person is the viewer. Someone else's private routine that the
 *  viewer can read stays in the time bands — it isn't "mine". */
export function isMinePrivate(item: BoardRoutine, self: FamilyMember | null | undefined): boolean {
  if (!self || item.explanation.kiosk.rung !== 'private') return false
  const owners = routineOwners(item.routine)
  if (owners.length > 0) return owners.length === 1 && owners[0] === self.id
  const selfAuth = self.auth_user_id ?? self.user_id
  return !!selfAuth && item.routine.user_id === selfAuth
}

function byWhen(a: BoardRoutine, b: BoardRoutine): number {
  const am = boardMinutes(a)
  const bm = boardMinutes(b)
  if (am != null && bm != null && am !== bm) return am - bm
  if (am != null && bm == null) return -1
  if (am == null && bm != null) return 1
  return a.routine.name.localeCompare(b.routine.name)
}

export function arrangeBoard(
  items: BoardRoutine[],
  arrangement: Arrangement,
  opts: { members?: FamilyMember[]; self?: FamilyMember | null } = {},
): BoardModel {
  const resting: BoardRoutine[] = []
  const off: BoardRoutine[] = []
  const running: BoardRoutine[] = []
  for (const item of items) {
    if (item.explanation.state === 'resting') resting.push(item)
    else if (item.explanation.state === 'off') off.push(item)
    else running.push(item)
  }

  const groups = new Map<string, BoardRoutine[]>()
  const push = (key: string, item: BoardRoutine) => groups.set(key, [...(groups.get(key) ?? []), item])
  let order: { key: string; label: string }[]

  if (arrangement === 'person') {
    const members = [...(opts.members ?? [])].sort((a, b) => a.display_order - b.display_order)
    order = [...members.map((m) => ({ key: `m:${m.id}`, label: m.name })), { key: 'household', label: 'Household' }, { key: 'unassigned', label: 'Unassigned' }]
    const known = new Set(members.map((m) => m.id))
    for (const item of running) {
      const owners = routineOwners(item.routine)
      if (owners.length === 0) push('unassigned', item)
      else if (owners.length === 1 && known.has(owners[0])) push(`m:${owners[0]}`, item)
      else push('household', item)
    }
  } else if (arrangement === 'where') {
    order = [
      { key: 'today', label: 'Today' }, { key: 'kiosk', label: 'Kiosk' },
      { key: 'week', label: 'Week' }, { key: 'nowhere', label: 'Nowhere' },
    ]
    for (const item of running) {
      const e = item.explanation
      push(e.today.shows ? 'today' : e.kiosk.shows ? 'kiosk' : e.week.shows ? 'week' : 'nowhere', item)
    }
  } else {
    order = TIME_BANDS
    for (const item of running) push(isMinePrivate(item, opts.self) ? 'private' : timeBandOf(item), item)
  }

  const bands = order
    .map(({ key, label }) => ({ key, label, items: [...(groups.get(key) ?? [])].sort(byWhen) }))
    .filter((b) => b.items.length > 0)
  const byName = (a: BoardRoutine, b: BoardRoutine) => a.routine.name.localeCompare(b.routine.name)
  return { bands, resting: resting.sort(byName), off: off.sort(byName) }
}

/** The days in words: "every day", "weekdays", "Tue & Thu", "monthly on the 1st". */
export function daysInWords(routine: Routine): string {
  const p = routine.recurrence_pattern
  if (p.type === 'daily') return p.interval && p.interval > 1 ? `every ${p.interval} days` : 'every day'
  if (p.type === 'weekend') return 'once a weekend'
  if (p.type === 'weekly') {
    const idx = (p.days ?? [])
      .map((d) => ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(d.toLowerCase()))
      .filter((i) => i >= 0)
    const key = [...new Set(idx)].sort((a, b) => a - b).join(',')
    const every = p.interval && p.interval > 1 ? `every ${p.interval} weeks, ` : ''
    if (!key) return p.interval && p.interval > 1 ? `every ${p.interval} weeks, any day` : 'any day each week'
    if (key === '0,1,2,3,4,5,6') return 'every day'
    if (key === '1,2,3,4,5') return `${every}weekdays`
    if (key === '0,6') return `${every}Sat & Sun`
    return `${every}${daysText(idx)}`
  }
  const s = ruleSentence(p)
  return s.charAt(0).toLowerCase() + s.slice(1)
}

/** "Liam, Mia · weekdays · 7:00 AM" — people · days · time (or "any time"). */
export function metaLine(routine: Routine, members: readonly FamilyMember[]): string {
  const people = routineOwners(routine)
    .map((id) => members.find((m) => m.id === id)?.name)
    .filter((n): n is string => !!n)
  const doses = (routine.times_per_day ?? []).map(clockText).filter((t): t is string => !!t)
  const time = doses.length ? doses.join(', ') : clockText(routine.time_of_day) ?? 'any time'
  return [people.join(', '), daysInWords(routine), time].filter(Boolean).join(' · ')
}
