import { describe, it, expect } from 'vitest'
import { resolveRoutine, routineOwners, isPinnedToTimeline } from './routineUtils'
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
// adopting it silently reshuffles who sees what. The ONLY intended difference
// is the default_assignee fallback, which this test pins by exclusion.
describe('rung 5 agrees with makeAssigneeFilter', () => {
  const selections = [null, 'scott', 'iris', ['scott', 'iris'], 'unassigned'] as const
  const routines = [
    createMockRoutine({ assigned_to: null, assigned_to_all: null }),
    createMockRoutine({ assigned_to: 'scott', assigned_to_all: null }),
    createMockRoutine({ assigned_to: 'iris', assigned_to_all: null }),
    createMockRoutine({ assigned_to: 'scott', assigned_to_all: ['scott', 'iris'] }),
  ]

  for (const selected of selections) {
    for (const routine of routines) {
      it(`${JSON.stringify(selected)} x ${routine.assigned_to ?? 'none'}/${JSON.stringify(routine.assigned_to_all)}`, () => {
        const legacy = makeAssigneeFilter(selected)(routine.assigned_to, routine.assigned_to_all)
        const resolved = resolveRoutine(routine, {
          date: CORPUS_DATE,
          member: selected,
          prefs: { hideRoutines: false, domain: 'universal' },
        })
        expect(resolved.reason === 'not-theirs').toBe(!legacy)
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
