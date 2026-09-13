import { describe, it, expect } from 'vitest'
import { routinePatterns } from './routinePatterns'
import type { Routine } from '@/types/actionable'
import type { Layer } from '@/lib/domains'

let n = 0
const routine = (over: Partial<Routine>): Routine => ({
  id: `r${++n}`, name: 'R', is_active: true, visibility: 'active',
  recurrence_pattern: { type: 'weekly' }, context: 'family', scope: 'compound',
  ...over,
} as Routine)

const ALL = new Set<Layer>(['work', 'family', 'personal', 'unsorted'])

describe('routinePatterns', () => {
  it('names each pattern with the app\'s own cadence vocabulary', () => {
    const rows = routinePatterns([
      routine({ name: 'Kitchen laundry', recurrence_pattern: { type: 'weekly' } }),
      routine({ name: 'Family planning', recurrence_pattern: { type: 'weekly', days: ['sun'] } }),
      routine({ name: 'Change the filter', recurrence_pattern: { type: 'monthly', day_of_month: 3 } }),
    ], ALL)
    expect(rows.map((r) => `${r.name} · ${r.cadence}`)).toEqual([
      'Kitchen laundry · Every week',
      'Family planning · Every Sun',
      'Change the filter · Monthly on the 3rd',
    ])
  })

  it('THE LENS FILTERS: a work routine is absent when only family is checked', () => {
    // The page's own suite stubs matchesLayers to a pass-through, so this is
    // the only place the domain lens is actually observable (review
    // 2026-09-13). Entries and count come from one array, so a count that
    // disagrees with what renders is not representable.
    const rows = routinePatterns([
      routine({ name: 'Kitchen laundry', context: 'family' }),
      routine({ name: 'Invoice review', context: 'work' }),
      routine({ name: 'Stretching', context: 'personal' }),
    ], new Set<Layer>(['family']))
    expect(rows.map((r) => r.name)).toEqual(['Kitchen laundry'])
    expect(rows).toHaveLength(1)
  })

  it('an untagged routine belongs to Unsorted, not to everyone', () => {
    const rows = [routine({ name: 'Unfiled', context: null })]
    expect(routinePatterns(rows, new Set<Layer>(['family']))).toHaveLength(0)
    expect(routinePatterns(rows, new Set<Layer>(['unsorted']))).toHaveLength(1)
  })

  it('a resting routine is not a commitment', () => {
    expect(routinePatterns([routine({ name: 'Camp mornings', visibility: 'reference' })], ALL)).toHaveLength(0)
  })

  it('a routine inside a collection is represented by its parent, not twice', () => {
    expect(routinePatterns([routine({ name: 'Step', parent_routine_id: 'p1' })], ALL)).toHaveLength(0)
  })

  it('includes DAILY routines — capacity you cannot read with the heaviest ones hidden', () => {
    const rows = routinePatterns([routine({ name: 'Dishes', recurrence_pattern: { type: 'daily' } })], ALL)
    expect(rows).toEqual([{ id: rows[0].id, name: 'Dishes', cadence: 'Every day' }])
  })
})
