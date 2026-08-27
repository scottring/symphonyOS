import { describe, it, expect } from 'vitest'
import { VISIBILITY_CORPUS, CORPUS_DATE } from '@/lib/routineVisibility.fixtures'
import { recordVisible } from '@/lib/today/surfaceParity'
import { isEverydayRoutine, matchesRecurrenceForDate, resolveRoutine } from '@/lib/routineUtils'
import type { Routine } from '@/types/actionable'

const ROUTINES = VISIBILITY_CORPUS.map((r) => r.routine)
const PREFS = { hideRoutines: false, domain: 'universal' as const }

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
