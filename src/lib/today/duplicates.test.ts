import { describe, it, expect } from 'vitest'
import type { TimelineItem } from '@/types/timeline'
import { normalizeTitle, findDuplicates, contextScore } from './duplicates'

const item = (over: Partial<TimelineItem> & { id: string; title: string }): TimelineItem => ({
  type: 'task', startTime: null, endTime: null, completed: false, ...over,
} as TimelineItem)

describe('normalizeTitle', () => {
  it('lowercases, strips punctuation, collapses whitespace', () => {
    expect(normalizeTitle('  Buy   MILK!! ')).toBe('buy milk')
  })
  it('strips emoji', () => {
    expect(normalizeTitle('Buy milk 🥛')).toBe('buy milk')
  })
  it('keeps distinct titles distinct', () => {
    expect(normalizeTitle('Buy milk')).not.toBe(normalizeTitle('Buy bread'))
  })
})

describe('findDuplicates', () => {
  it('pairs exact normalized matches', () => {
    const pairs = findDuplicates([
      item({ id: 'task-1', title: 'Buy milk' }),
      item({ id: 'task-2', title: 'buy  MILK' }),
      item({ id: 'task-3', title: 'Buy bread' }),
    ])
    expect(pairs).toHaveLength(1)
    expect(pairs[0].items.map((i) => i.id).sort()).toEqual(['task-1', 'task-2'])
  })

  it('does NOT pair near-misses — a false positive deletes real work', () => {
    expect(findDuplicates([
      item({ id: 'task-1', title: 'Call the dentist' }),
      item({ id: 'task-2', title: 'Call the dentist back' }),
    ])).toEqual([])
  })

  it('pre-selects the context-richer copy as keeper', () => {
    const bare = item({ id: 'task-1', title: 'Buy milk' })
    const rich = item({ id: 'task-2', title: 'Buy milk', notes: 'oat, not skim', projectId: 'p1' })
    expect(findDuplicates([bare, rich])[0].keeper.id).toBe('task-2')
  })

  it('flags a task/routine pair as cross-type', () => {
    const pairs = findDuplicates([
      item({ id: 'task-1', title: 'Water plants' }),
      item({ id: 'routine-r1', title: 'Water plants', type: 'routine' }),
    ])
    expect(pairs[0].crossType).toBe(true)
  })

  it('a same-type pair is not cross-type', () => {
    const pairs = findDuplicates([
      item({ id: 'task-1', title: 'Water plants' }),
      item({ id: 'task-2', title: 'Water plants' }),
    ])
    expect(pairs[0].crossType).toBe(false)
  })

  it('ignores completed items — they are history, not clutter', () => {
    expect(findDuplicates([
      item({ id: 'task-1', title: 'Buy milk' }),
      item({ id: 'task-2', title: 'Buy milk', completed: true }),
    ])).toEqual([])
  })

  it('groups three copies into ONE pair, not three', () => {
    const pairs = findDuplicates([
      item({ id: 'task-1', title: 'Buy milk' }),
      item({ id: 'task-2', title: 'Buy milk' }),
      item({ id: 'task-3', title: 'buy milk' }),
    ])
    expect(pairs).toHaveLength(1)
    expect(pairs[0].items).toHaveLength(3)
  })

  it('returns nothing for an empty or single-item day', () => {
    expect(findDuplicates([])).toEqual([])
    expect(findDuplicates([item({ id: 'task-1', title: 'Buy milk' })])).toEqual([])
  })

  it('ignores a blank normalized title rather than pairing every emoji-only row', () => {
    expect(findDuplicates([
      item({ id: 'task-1', title: '🎉' }),
      item({ id: 'task-2', title: '!!!' }),
    ])).toEqual([])
  })

  it('never pairs a group wrapper with its own child by title', () => {
    // Grouping names the wrapper after the target card (Stage 2b), so a wrapper
    // and its child legitimately share a title. Offering to delete one of them
    // would dissolve a group the user just built.
    const wrapper = item({ id: 'task-w', title: 'Morning errands' })
    const child = item({ id: 'task-c', title: 'Morning errands', isSubtask: true, parentTaskId: 'w' })
    expect(findDuplicates([wrapper, child])).toEqual([])
  })
})

describe('contextScore', () => {
  it('counts each kind of context once', () => {
    expect(contextScore(item({ id: 'a', title: 'x' }))).toBe(0)
    expect(contextScore(item({ id: 'b', title: 'x', notes: 'n' }))).toBe(1)
    expect(contextScore(item({ id: 'c', title: 'x', notes: 'n', projectId: 'p' }))).toBe(2)
  })
})
