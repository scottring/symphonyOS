//
// The shelf's Routines view lists routines that have NO HOME yet — nothing
// the week grid can place. Dropping one on the grid pins the missing pieces
// down (see the place-scope popover in WeekViewV2).
//
// Eligibility runs through the ONE resolver (resolveRoutineEligible — the
// date-agnostic drag-pool question); this module only adds the "needs a
// home" reading on top of it.
import type { ActionableInstance, Routine } from '@/types/actionable'
import { resolveRoutineEligible, type ResolveRoutineCtx } from '@/lib/routineUtils'
import { addDays } from '@/lib/dateUtils'

export type UnhomedCtx = Omit<ResolveRoutineCtx, 'date' | 'deferredInto' | 'lastCompletedAt'>

/** The week a flexible routine is being planned into, with every instance
 *  touching it: a routine already placed on (or done on) one of its days has
 *  a home for THAT week and leaves the list — next week it is back. */
export interface UnhomedWeek {
  weekStart: Date
  instances: readonly ActionableInstance[]
}

/** Has this routine an occurrence in the week — placed onto one of its days
 *  ("Give it a day" writes a pending instance with `deferred_to`), or ticked
 *  there? A skip is not a home. */
export function placedInWeek(routineId: string, week: UnhomedWeek): boolean {
  const start = new Date(week.weekStart); start.setHours(0, 0, 0, 0)
  const end = addDays(start, 7)
  const inWeek = (d: Date) => d >= start && d < end
  return week.instances.some((i) => {
    if (i.entity_type !== 'routine' || i.entity_id !== routineId || i.status === 'skipped') return false
    if (i.deferred_to && inWeek(new Date(i.deferred_to))) return true
    if (i.status === 'completed') { const [y, m, d] = i.date.split('-').map(Number); return inWeek(new Date(y, m - 1, d)) }
    return false
  })
}

/** Eligible routines with no DAY to land on: a weekly pattern with no days
 *  chosen. A routine that names its day has a home — the journal draws it
 *  there, timed or under "Available" — so listing it here too drew it twice
 *  ("Do kitchen laundry · Sat · no set time" beside Saturday's Available line,
 *  seen on prod 2026-09-20). Missing only a TIME is not homeless. */
export function unhomedRoutines(routines: Routine[], ctx: UnhomedCtx, week?: UnhomedWeek): Routine[] {
  return routines.filter((r) => {
    if (!resolveRoutineEligible(r, ctx).shows) return false
    if (r.recurrence_pattern.type !== 'weekly' || r.recurrence_pattern.days?.length) return false
    return !(week && placedInWeek(r.id, week))
  })
}
