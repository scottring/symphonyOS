import { describe, expect, it } from 'vitest'
import { weekRoutineChoices } from './weekRoutineChoices'
import { createMockRoutine } from '@/test/mocks/factories'
import { ALL_LAYERS } from '@/lib/domains'
import type { ActionableInstance } from '@/types/actionable'
const weekStart = new Date(2026, 8, 20)
const routine = createMockRoutine({ id: 'read', name: 'Read', time_of_day: null, recurrence_pattern: { type: 'daily' } })
const input = { weekStart, selectedAssignee: [] as string[], hideRoutines: false, layers: ALL_LAYERS }

describe('week routine choices', () => {
  it('offers untimed occurrences on each day; excludes timed, completed and already chosen occurrences', () => {
    const timed = createMockRoutine({ id: 'timed', time_of_day: '09:00', recurrence_pattern: { type: 'daily' } })
    const instances = [
      { entity_type: 'routine', entity_id: 'read', date: '2026-09-21', status: 'completed' },
      { entity_type: 'routine', entity_id: 'read', date: '2026-09-22', status: 'pending', planned_on: '2026-09-22' },
    ] as ActionableInstance[]
    const days = weekRoutineChoices(input, [routine, timed], () => [routine, timed], instances)
    expect(days).toHaveLength(7)
    expect(days[0].entries.map(entry => entry.id)).toEqual(['read'])
    expect(days[1].entries).toEqual([])
    expect(days[2].entries).toEqual([])
    expect(days[3].entries.map(entry => entry.id)).toEqual(['read'])
  })
  it('omits skipped occurrences without hiding the other days', () => {
    const instances = [{ entity_type: 'routine', entity_id: 'read', date: '2026-09-21', status: 'skipped' }] as ActionableInstance[]
    const days = weekRoutineChoices(input, [routine], () => [routine], instances)
    expect(days[1].entries).toEqual([])
    expect(days[2].entries).toHaveLength(1)
  })
})
