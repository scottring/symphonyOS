import { describe, it, expect } from 'vitest'
import { resolveRoutine, routineOwners, isPinnedToTimeline, isDraggableRoutine } from './routineUtils'
import { VISIBILITY_CORPUS, CORPUS_DATE } from './routineVisibility.fixtures'
import { makeAssigneeFilter } from './today/assigneeFilter'
import { createMockRoutine } from '@/test/mocks/factories'

describe('resolveRoutine — conformance corpus', () => {
  for (const row of VISIBILITY_CORPUS) {
    it(`${row.label} -> ${row.expected}`, () => {
      const result = resolveRoutine(row.routine, row.ctx)
      expect(result.reason).toBe(row.expected)
      expect(result.shows).toBe(row.expected === 'shows')
    })
  }

  it('covers every reason at least once', () => {
    const seen = new Set(VISIBILITY_CORPUS.map((r) => r.expected))
    expect([...seen].sort()).toEqual([
      'everyday', 'in-collection', 'not-theirs', 'not-today',
      'off', 'other-domain', 'resting', 'shows',
    ])
  })
})

describe('routineOwners', () => {
  it('prefers assigned_to_all', () => {
    const r = createMockRoutine({ assigned_to: 'scott', assigned_to_all: ['iris', 'ella'] })
    expect(routineOwners(r)).toEqual(['iris', 'ella'])
  })

  it('falls back to assigned_to', () => {
    expect(routineOwners(createMockRoutine({ assigned_to: 'scott' }))).toEqual(['scott'])
  })

  it('falls back to default_assignee', () => {
    const r = createMockRoutine({ assigned_to: null, default_assignee: 'kaleb' })
    expect(routineOwners(r)).toEqual(['kaleb'])
  })

  it('is empty when nothing is assigned', () => {
    expect(routineOwners(createMockRoutine({ assigned_to: null }))).toEqual([])
  })

  it('treats an empty assigned_to_all as unset', () => {
    const r = createMockRoutine({ assigned_to: 'scott', assigned_to_all: [] })
    expect(routineOwners(r)).toEqual(['scott'])
  })
})

// Rung 5 must agree with the filter every other surface already uses, or
// adopting it silently reshuffles who sees what. TWO divergences are
// intentional, both named here and pinned by an exact (selection, routine)
// pair below — so a THIRD divergence still fails this test loudly instead of
// hiding behind a weakened assertion:
//
//   (a) the `default_assignee` fallback. Rung 5 grants ownership to
//       `default_assignee` when neither `assigned_to` nor `assigned_to_all`
//       is set; `makeAssigneeFilter` has no such fallback. None of the
//       routines below set `default_assignee`, so this divergence is
//       exercised directly by the `routineOwners` unit tests above instead
//       of here — it never fires in this cross-check.
//   (b) `assigned_to_all` TOTALLY overrides a stale `assigned_to`, rather
//       than OR-combining with it. `makeAssigneeFilter` OR-combines the two
//       columns, so it still matches the old single assignee even after
//       `assigned_to_all` has moved on. `routineOwners`/`resolveRoutine`
//       treat a non-empty `assigned_to_all` as authoritative instead. This
//       is not an edge case: Three of the five assignment write paths
//       (src/components/routine/RhythmPage.tsx:396,
//       src/components/detail/DetailPanelRedesign.tsx:2187,
//       src/apps/tasks/TaskDetailPanel.tsx:367) write `assigned_to_all`
//       alone and leave `assigned_to` stale behind it, so reassigning a
//       routine from Scott to Iris through nearly any panel leaves
//       `assigned_to: 'scott'` pointing at the old owner.
//       (`RoutineForm.tsx:279` and `useScheduleActions.ts:87` write both
//       columns together and are unaffected.) The resolver is right to let
//       the newer, multi-member column win outright — the legacy
//       OR-combine is the bug this replaces, not a rule to preserve.
describe('rung 5 agrees with makeAssigneeFilter', () => {
  const selections = [null, 'scott', 'iris', ['scott', 'iris'], 'unassigned'] as const
  const routines = [
    createMockRoutine({ assigned_to: null, assigned_to_all: null }),
    createMockRoutine({ assigned_to: 'scott', assigned_to_all: null }),
    createMockRoutine({ assigned_to: 'iris', assigned_to_all: null }),
    createMockRoutine({ assigned_to: 'scott', assigned_to_all: ['scott', 'iris'] }),
    // Divergence (b): assigned_to_all=['iris'] wins outright over the stale
    // assigned_to='scott' — the exact shape three of five write paths leave
    // behind after a reassignment.
    createMockRoutine({ assigned_to: 'scott', assigned_to_all: ['iris'] }),
  ]

  // The only (selection, routine-shape) pairs where legacy and resolved are
  // EXPECTED to disagree. Anything not listed here must agree — if it
  // doesn't, that's a new, unreviewed divergence and the test should fail.
  const KNOWN_DIVERGENCES: ReadonlyArray<{
    selected: (typeof selections)[number]
    assigned_to: string | null
    assigned_to_all: readonly string[] | null
  }> = [
    // Divergence (b) fires here: member 'scott' is the stale assigned_to,
    // but assigned_to_all=['iris'] has moved on — legacy still shows it to
    // Scott, the resolver correctly hides it from him.
    { selected: 'scott', assigned_to: 'scott', assigned_to_all: ['iris'] },
  ]

  const isKnownDivergence = (selected: (typeof selections)[number], routine: { assigned_to: string | null; assigned_to_all: string[] | null }) =>
    KNOWN_DIVERGENCES.some(
      (d) =>
        JSON.stringify(d.selected) === JSON.stringify(selected) &&
        d.assigned_to === routine.assigned_to &&
        JSON.stringify(d.assigned_to_all) === JSON.stringify(routine.assigned_to_all),
    )

  for (const selected of selections) {
    for (const routine of routines) {
      it(`${JSON.stringify(selected)} x ${routine.assigned_to ?? 'none'}/${JSON.stringify(routine.assigned_to_all)}`, () => {
        const legacy = makeAssigneeFilter(selected)(routine.assigned_to, routine.assigned_to_all)
        const resolved = resolveRoutine(routine, {
          date: CORPUS_DATE,
          member: selected,
          prefs: { hideRoutines: false, domain: 'universal' },
        })
        const agree = (resolved.reason === 'not-theirs') === !legacy
        if (isKnownDivergence(selected, routine)) {
          // Pinned exception: expected to DISAGREE. If this ever starts
          // agreeing, the divergence has been fixed elsewhere and this
          // entry (and its comment above) must be deleted, not left stale.
          expect(agree).toBe(false)
        } else {
          expect(agree).toBe(true)
        }
      })
    }
  }
})

describe('isPinnedToTimeline', () => {
  it('is true for an explicit pin', () => {
    expect(isPinnedToTimeline(createMockRoutine({ pin_to_timeline: true }))).toBe(true)
  })
  it('is true for a dosed routine', () => {
    expect(isPinnedToTimeline(createMockRoutine({ times_per_day: ['08:00'] }))).toBe(true)
  })
  it('is false otherwise', () => {
    expect(isPinnedToTimeline(createMockRoutine())).toBe(false)
  })
})

describe('isDraggableRoutine', () => {
  it('is true for an untimed routine', () => {
    expect(isDraggableRoutine(createMockRoutine({ time_of_day: null }))).toBe(true)
  })
  it('is false for a timed routine', () => {
    expect(isDraggableRoutine(createMockRoutine({ time_of_day: '09:00' }))).toBe(false)
  })
})
