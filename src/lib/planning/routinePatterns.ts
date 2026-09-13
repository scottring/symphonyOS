// src/lib/planning/routinePatterns.ts
//
// The recurring commitments a PERIOD page shows for reference — patterns, not
// occurrences. A month is not a day, so eligibility asks the date-agnostic
// question through the one resolver: asking "does this recur today" would hide
// most of what actually takes up the month.
//
// Pure, and deliberately so: the page's own test suite stubs matchesLayers to
// a pass-through, which silently neutered the domain lens when this filter
// lived inline in the component (review 2026-09-13).

import type { Routine } from '@/types/actionable'
import type { Layer } from '@/lib/domains'
import { resolveRoutineEligible } from '@/lib/routineUtils'
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
export function routinePatterns(routines: readonly Routine[], layers: ReadonlySet<Layer>): RoutinePattern[] {
  return routines
    .filter((r) => resolveRoutineEligible(r, { prefs: { hideRoutines: false, layers } }).shows)
    .map((r) => ({ id: r.id, name: r.name, cadence: describeRecurrence(r.recurrence_pattern) }))
}
