//
// The shelf's Routines view lists routines that have NO HOME yet — nothing
// the week grid can place. Dropping one on the grid pins the missing pieces
// down (see the place-scope popover in WeekViewV2).
//
// Eligibility runs through the ONE resolver (resolveRoutineEligible — the
// date-agnostic drag-pool question); this module only adds the "needs a
// home" reading on top of it.
import type { Routine } from '@/types/actionable'
import { resolveRoutineEligible, type ResolveRoutineCtx } from '@/lib/routineUtils'

export type UnhomedCtx = Omit<ResolveRoutineCtx, 'date' | 'deferredInto' | 'lastCompletedAt'>

/** Eligible routines with no DAY to land on: a weekly pattern with no days
 *  chosen. A routine that names its day has a home — the journal draws it
 *  there, timed or under "Available" — so listing it here too drew it twice
 *  ("Do kitchen laundry · Sat · no set time" beside Saturday's Available line,
 *  seen on prod 2026-09-20). Missing only a TIME is not homeless. */
export function unhomedRoutines(routines: Routine[], ctx: UnhomedCtx): Routine[] {
  return routines.filter((r) => {
    if (!resolveRoutineEligible(r, ctx).shows) return false
    return r.recurrence_pattern.type === 'weekly' && !r.recurrence_pattern.days?.length
  })
}
