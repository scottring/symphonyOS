import { describe, it, expect } from 'vitest'
import { routinesForViewedDate } from './routinesForDate'
import { deferredInRoutineIds } from './deferredRoutines'
import { createMockRoutine, createMockActionableInstance } from '@/test/mocks/factories'
import type { RecurrencePattern } from '@/types/actionable'

// A weekly routine with no day of its own, chosen for Wednesday with "All
// Day": the occurrence carries planned_on and no time. Its rule still names no
// day, so only the choice puts it on Wednesday (2026-09-23).
const wednesday = new Date(2026, 4, 20)
const flexible = createMockRoutine({ id: 'f1', name: 'Water the plants', time_of_day: null, recurrence_pattern: { type: 'weekly' } as RecurrencePattern })
const chosen = createMockActionableInstance({ entity_type: 'routine', entity_id: 'f1', date: '2026-05-20', status: 'pending', deferred_to: null, planned_on: '2026-05-20' })

describe('an untimed day choice places a flexible routine on that day', () => {
  it('is on the chosen day', () => {
    expect(routinesForViewedDate([], [flexible], [chosen], wednesday).map((r) => r.id)).toEqual(['f1'])
    expect(deferredInRoutineIds([chosen], wednesday).has('f1')).toBe(true)
  })

  it('is on no other day, and the rule itself still names no day', () => {
    const thursday = new Date(2026, 4, 21)
    expect(routinesForViewedDate([], [flexible], [chosen], thursday)).toEqual([])
    expect(flexible.recurrence_pattern).toEqual({ type: 'weekly' })
  })

  it('does not count a skipped occurrence', () => {
    const skipped = { ...chosen, status: 'skipped' as const }
    expect(routinesForViewedDate([], [flexible], [skipped], wednesday)).toEqual([])
  })
})
