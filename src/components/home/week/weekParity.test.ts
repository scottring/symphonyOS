import { describe, it, expect } from 'vitest'
import { VISIBILITY_CORPUS, CORPUS_DATE } from '@/lib/routineVisibility.fixtures'
import { recordVisible } from '@/lib/today/surfaceParity'
import { isEverydayRoutine, matchesRecurrenceForDate, resolveRoutine } from '@/lib/routineUtils'
import type { Routine } from '@/types/actionable'
import { ALL_LAYERS } from '@/lib/domains'

const ROUTINES = VISIBILITY_CORPUS.map((r) => r.routine)
const PREFS = { hideRoutines: false, layers: ALL_LAYERS }

/** WeekViewV2's routine filter as it exists before migration. */
function weekGridBefore(routines: Routine[], hideRoutines: boolean): Routine[] {
  const showable = routines.filter((r) => r.show_on_timeline !== false)
  const visible = hideRoutines
    ? showable.filter((r) => !isEverydayRoutine(r.recurrence_pattern))
    : showable
  return visible.filter((r) => matchesRecurrenceForDate(r, CORPUS_DATE))
}

describe('Week grid parity — the two intended changes, and nothing else', () => {
  it('drops exactly the collection steps and the not-theirs rows', () => {
    const before = recordVisible(ROUTINES, (rs) => weekGridBefore(rs, false), (r) => r.id)
    const after = recordVisible(
      ROUTINES,
      (rs) => rs.filter((r) => resolveRoutine(r, { date: CORPUS_DATE, prefs: PREFS }).shows),
      (r) => r.id,
    )
    const dropped = before.filter((id) => !after.includes(id))
    const added = after.filter((id) => !before.includes(id))

    // Everything dropped must be a routine the resolver calls a step or a
    // resting routine — never a routine that simply "used to show".
    const reasonById = new Map(
      ROUTINES.map((r) => [r.id, resolveRoutine(r, { date: CORPUS_DATE, prefs: PREFS }).reason]),
    )
    expect(dropped.length).toBeGreaterThan(0) // the corpus must exercise the change
    for (const id of dropped) {
      expect(['in-collection', 'resting']).toContain(reasonById.get(id))
    }
    expect(added).toEqual([])
  })

  it('pinned routines now survive hide-daily on the week grid', () => {
    const pinned = ROUTINES.filter((r) => r.pin_to_timeline === true)
    expect(pinned.length).toBeGreaterThan(0)
    for (const r of pinned) {
      expect(weekGridBefore([r], true)).toEqual([])
      expect(resolveRoutine(r, { date: CORPUS_DATE, prefs: { ...PREFS, hideRoutines: true } }).shows).toBe(true)
    }
  })
})

// NOTE: this does NOT cover the week grid's prop threading (WeekViewV2.tsx
// passing `member: selectedAssignees` into resolveRoutine, and the
// equivalent line in WeekViewMobile.tsx). It calls resolveRoutine directly,
// so it would keep passing even if that threading were deleted and the
// original "assignee filter never reaches the grid" bug came back. That
// wiring is covered by render-based tests instead: the
// "narrows routines to the selected assignee (rung 5 wiring)" test in
// WeekViewMobile.test.tsx, and the same-named test in WeekViewV2.test.tsx —
// both actually render the component and would fail if the `member:` prop
// were dropped. This block only re-confirms resolveRoutine's own rung-5
// narrowing behaves the same way over a real corpus row, which is already
// exhaustively covered by routineUtils.resolveRoutine.test.ts; it's kept
// here as a cheap sanity check, not as coverage of either view.
describe('resolveRoutine rung 5 over the corpus (not a week-grid wiring test)', () => {
  it('resolveRoutine itself narrows to a specific member, and widens back for "everyone" or the actual owner', () => {
    // Looked up by label — corpus ids are auto-generated and shift when rows
    // are added, so a hardcoded id would silently start pointing at the
    // wrong row.
    const row = VISIBILITY_CORPUS.find((r) => r.label === 'assigned to someone else')
    if (!row) throw new Error('corpus row "assigned to someone else" not found')
    const routine = row.routine // assigned_to: 'iris'

    const poolFor = (member: string | undefined) =>
      recordVisible(
        [routine],
        (rs) => rs.filter((r) => resolveRoutine(r, { date: CORPUS_DATE, member, prefs: PREFS }).shows),
        (r) => r.id,
      )

    // Nobody selected ("everyone") — the routine shows.
    expect(poolFor(undefined)).toEqual([routine.id])
    // Selecting someone who is NOT the owner narrows it away.
    expect(poolFor('scott')).toEqual([])
    // Selecting the actual owner keeps it.
    expect(poolFor('iris')).toEqual([routine.id])
  })
})
