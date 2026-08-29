import { describe, it, expect } from 'vitest'
import { VISIBILITY_CORPUS, CORPUS_DATE } from '@/lib/routineVisibility.fixtures'
import { recordVisible } from '@/lib/today/surfaceParity'
import { isEverydayRoutine, matchesRecurrenceForDate, resolveRoutine } from '@/lib/routineUtils'
import type { Routine } from '@/types/actionable'
import { ALL_LAYERS } from '@/lib/domains'

// WHAT THIS FILE PROVES, AND WHAT IT DOES NOT.
//
// This is a characterization test, same shape as weekParity.test.ts: it
// replays the shared conformance corpus through PlanningSession's LEGACY
// `routinesByDate` filter chain ("before", reassembled below) and through
// resolveRoutine ("after"), then diffs the two id sets. It proves the
// migration preserved Planning's routine pool, modulo the one intended,
// explicitly checked divergence (collection steps).
//
// It does NOT prove PlanningSession.tsx (or GuidedSessionContainer.tsx)
// actually CALLS resolveRoutine this way — that's wiring, and calling
// resolveRoutine directly here would keep passing even if the real
// production call were deleted. Render-based wiring coverage, including the
// mandatory deferred-in regression test, lives in PlanningSession.test.tsx
// instead, under "PlanningSession — resolveRoutine wiring (rendered)".

const ROUTINES = VISIBILITY_CORPUS.map((r) => r.routine)
const PREFS = { hideRoutines: false, layers: ALL_LAYERS }

/**
 * PlanningSession's `routinesByDate` filter chain as it existed before this
 * migration:
 *   .filter(r => r.show_on_timeline !== false)
 *   .filter(r => !hideRoutines || !isEverydayRoutine(r.recurrence_pattern))
 *
 * That chain never checked `visibility` or recurrence itself — it trusted
 * `getRoutinesForDate` / `routines` (the caller-supplied pool) to have
 * already narrowed to active, date-matching routines, which is exactly what
 * `useRoutines().getRoutinesForDate` does in production (see
 * useRoutines.ts: `activeRoutines` filters `visibility === 'active'` before
 * the recurrence check). A fair "before" has to include that upstream
 * narrowing too, or the diff below fills up with 'not-today'/'resting' noise
 * that is a comparison artifact, not a real behavior change — see
 * todayParity.test.ts's note on this exact trap.
 */
function planningBefore(routines: Routine[], hideRoutines: boolean): Routine[] {
  const activeForDate = routines.filter(
    (r) => r.visibility === 'active' && matchesRecurrenceForDate(r, CORPUS_DATE),
  )
  const showable = activeForDate.filter((r) => r.show_on_timeline !== false)
  return hideRoutines ? showable.filter((r) => !isEverydayRoutine(r.recurrence_pattern)) : showable
}

describe('Planning grid parity — the two intended changes, and nothing else', () => {
  it('drops exactly the collection steps', () => {
    const before = recordVisible(ROUTINES, (rs) => planningBefore(rs, false), (r) => r.id)
    const after = recordVisible(
      ROUTINES,
      (rs) => rs.filter((r) => resolveRoutine(r, { date: CORPUS_DATE, prefs: PREFS }).shows),
      (r) => r.id,
    )
    const dropped = before.filter((id) => !after.includes(id))
    const added = after.filter((id) => !before.includes(id))

    const reasonById = new Map(
      ROUTINES.map((r) => [r.id, resolveRoutine(r, { date: CORPUS_DATE, prefs: PREFS }).reason]),
    )
    expect(dropped.length).toBeGreaterThan(0) // the corpus must exercise the change
    for (const id of dropped) {
      expect(reasonById.get(id)).toBe('in-collection')
    }
    expect(added).toEqual([])
  })

  it('pinned routines still survive hide-daily on the Planning grid', () => {
    const pinned = ROUTINES.filter((r) => r.pin_to_timeline === true)
    expect(pinned.length).toBeGreaterThan(0)
    for (const r of pinned) {
      expect(resolveRoutine(r, { date: CORPUS_DATE, prefs: { ...PREFS, hideRoutines: true } }).shows).toBe(true)
    }
  })
})

// NOTE ON THE SECOND NAMED CHANGE ("the assignee filter starts applying"):
// unlike Week (WeekViewV2/WeekViewMobile thread a live `selectedAssignees`
// into resolveRoutine's `member`), Planning has NO live assignee-selector
// anywhere in its call chain today — PlanningSession.tsx never accepts a
// `member`/assignee prop, GuidedSessionContainer.tsx never passes one, and
// ScheduleGridStep's own person-filter for TASKS is hardcoded to
// `makeAssigneeFilter([])` ("everyone"), not read from any selector. So rung
// 5 is now part of the ladder Planning's routines pass through, but nothing
// in this task wires a real selection into it: the change is structural
// (the capability exists) rather than observable (no screen renders
// differently today because of it). This block is the same sanity check
// weekParity.test.ts keeps for the same reason: it exercises resolveRoutine
// directly, already exhaustively covered by routineUtils.resolveRoutine.test.ts,
// and is NOT a Planning wiring test — there is no wiring to test yet.
describe('resolveRoutine rung 5 over the corpus (not a Planning wiring test — none exists yet)', () => {
  it('resolveRoutine itself narrows to a specific member, and widens back for "everyone" or the actual owner', () => {
    const row = VISIBILITY_CORPUS.find((r) => r.label === 'assigned to someone else')
    if (!row) throw new Error('corpus row "assigned to someone else" not found')
    const routine = row.routine

    const poolFor = (member: string | undefined) =>
      recordVisible(
        [routine],
        (rs) => rs.filter((r) => resolveRoutine(r, { date: CORPUS_DATE, member, prefs: PREFS }).shows),
        (r) => r.id,
      )

    expect(poolFor(undefined)).toEqual([routine.id])
    expect(poolFor('scott')).toEqual([])
    expect(poolFor('iris')).toEqual([routine.id])
  })
})
