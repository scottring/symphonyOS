// "Keep it until it's done" (Scott, 2026-11-11: "Pay FFG" was due on the
// 10th, he forgot, and it stayed quietly on the 10th). A routine with
// keep_until_done carries its last missed occurrence forward onto Today, as
// "from Tue", until it is ticked off or skipped — or until its next
// occurrence comes due, which then stands for it.
//
// Pure: given the routines, the instances of the look-back window and today,
// it returns what to carry. Completing a carried row writes the ORIGINAL
// occurrence (its date), so history stays true.

import type { Routine } from '@/types/routine'
import type { ActionableInstance } from '@/types/actionable'
import { localYmd } from '@/lib/cadence/config'
import { matchesRecurrenceForDate, namesDueDays, routineSwitches } from '@/lib/routineUtils'

/** How far back a missed occurrence is looked for: a monthly routine's last
 *  one is at most a month back; a little more covers a moved one. */
export const CARRY_LOOKBACK_DAYS = 62

export interface CarriedRoutine {
  routine: Routine
  /** The occurrence's own date (the instance key). */
  date: Date
  /** Where it was last due: its own date, or the day it was moved to. */
  dueOn: Date
}

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const parseYmd = (s: string) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d) }

/** The routines that may carry: switched on, running, with days of their own
 *  (a routine with no set day is offered to choose, never "missed"). */
export function carriesForward(r: Routine): boolean {
  return !!r.keep_until_done && routineSwitches(r).active && !r.parent_routine_id && namesDueDays(r.recurrence_pattern)
}

export function selectCarriedRoutines(
  routines: readonly Routine[],
  instances: readonly ActionableInstance[],
  today: Date,
  lookbackDays = CARRY_LOOKBACK_DAYS,
): CarriedRoutine[] {
  const start = dayStart(today)
  const todayYmd = localYmd(start)
  const out: CarriedRoutine[] = []
  for (const r of routines) {
    if (!carriesForward(r)) continue
    if (r.paused_until && new Date(r.paused_until) > start) continue
    // Due today: today's own occurrence stands for it.
    if (matchesRecurrenceForDate(r, start)) continue
    const mine = instances.filter((i) => i.entity_type === 'routine' && i.entity_id === r.id)
    const created = r.created_at ? dayStart(new Date(r.created_at)) : null
    // The latest occurrence before today, from the rule…
    let last: Date | null = null
    for (let n = 1; n <= lookbackDays; n++) {
      const d = addDays(start, -n)
      if (created && d < created) break
      if (matchesRecurrenceForDate(r, d)) { last = d; break }
    }
    if (!last) continue
    const ymd = localYmd(last)
    const inst = mine.find((i) => i.date.slice(0, 10) === ymd)
    if (inst && (inst.status === 'completed' || inst.status === 'skipped')) continue
    // Moved to another day: it is that day's until that day has passed.
    const moved = inst?.deferred_to ? localYmd(new Date(inst.deferred_to)) : inst?.planned_on ?? null
    const dueYmd = moved ?? ymd
    if (dueYmd >= todayYmd) continue
    out.push({ routine: r, date: last, dueOn: parseYmd(dueYmd) })
  }
  return out.sort((a, b) => a.dueOn.getTime() - b.dueOn.getTime())
}

/** "from Tue", "from Nov 10" (a week or more back). */
export function carriedFrom(dueOn: Date, today: Date): string {
  const days = Math.round((dayStart(today).getTime() - dayStart(dueOn).getTime()) / 86400000)
  if (days === 1) return 'from yesterday'
  if (days < 7) return `from ${dueOn.toLocaleDateString('en-US', { weekday: 'short' })}`
  return `from ${dueOn.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}
