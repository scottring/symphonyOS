import { describe, it, expect } from 'vitest'
import { VISIBILITY_CORPUS } from '@/lib/routineVisibility.fixtures'
import { corpusScenarios, recordVisible } from './surfaceParity'
import { filterRoutinesForDomain } from './domainFilter'
import { makeAssigneeFilter } from './assigneeFilter'
import { getRoutinesForDatePure, isEverydayRoutine } from '@/lib/routineUtils'
import type { Routine } from '@/types/actionable'
import type { ResolveRoutineCtx } from '@/lib/routineUtils'

// The Today pipeline as it exists BEFORE migration, reassembled here from the
// six files it is spread across.
//
// Every stage is INLINED on purpose — nothing here calls the production
// functions this task is about to change. A characterization test that calls
// selectVisibleRoutines would break the moment Step 4 changes its signature,
// and a "before" recording that moves when you change the code is not a
// recording of anything. This function must not be edited after Step 3.
function todayPipelineBefore(routines: Routine[], ctx: ResolveRoutineCtx): Routine[] {
  // useRoutines.activeRoutines
  const active = routines.filter((r) => r.visibility === 'active')

  // useRoutines.getRoutinesForDate — since_last needs the completion map
  const lastMap = ctx.lastCompletedAt
    ? new Map(active.map((r) => [r.id, ctx.lastCompletedAt as Date]))
    : undefined
  const forDate = getRoutinesForDatePure(active, ctx.date, lastMap)

  // HomeView.filteredRoutines
  const domained = filterRoutinesForDomain(forDate, ctx.prefs.domain)

  // statusMaps.selectVisibleRoutines, inlined as of 2026-08-26
  const showable = domained.filter((r) => r.show_on_timeline !== false)
  const parentIds = new Set(showable.filter((r) => r.parent_routine_id).map((r) => r.parent_routine_id))
  const pinned = (r: Routine) => r.pin_to_timeline === true || (r.times_per_day?.length ?? 0) > 0
  const visible = !ctx.prefs.hideRoutines
    ? showable
    : showable.filter(
        (r) =>
          r.parent_routine_id != null ||
          parentIds.has(r.id) ||
          pinned(r) ||
          !isEverydayRoutine(r.recurrence_pattern),
      )

  // grouping.buildGroupedSections
  const match = makeAssigneeFilter(ctx.member ?? null)
  return visible.filter((r) => match(r.assigned_to, r.assigned_to_all))
}

describe('Today surface parity', () => {
  for (const [key, rows] of corpusScenarios(VISIBILITY_CORPUS)) {
    const ctx = rows[0].ctx
    it(`renders the same routines for ${key}`, () => {
      const routines = rows.map((r) => r.routine)
      const before = recordVisible(routines, (rs) => todayPipelineBefore(rs, ctx), (r) => r.id)
      const expected = rows.filter((r) => r.expected === 'shows').map((r) => r.routine.id).sort()
      expect(before).toEqual(expected)
    })
  }
})
