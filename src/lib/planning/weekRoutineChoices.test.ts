import { describe, expect, it } from 'vitest'
import { weekRoutineChoices } from './weekRoutineChoices'
import { createMockRoutine } from '@/test/mocks/factories'
import { ALL_LAYERS } from '@/lib/domains'
import type { ActionableInstance } from '@/types/actionable'
const weekStart = new Date(2026, 8, 20)
// Show in Today not positively set (null): offered as a choice each day.
const routine = createMockRoutine({ id: 'read', name: 'Read', time_of_day: null, recurrence_pattern: { type: 'daily' }, show_on_timeline: null as unknown as boolean })
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
  it('a due routine with Show in Today on is never offered — it is already on each of its days', () => {
    const on = createMockRoutine({ id: 'on', name: 'Vitamins', time_of_day: null, recurrence_pattern: { type: 'daily' }, show_on_timeline: true })
    const days = weekRoutineChoices(input, [on], () => [on], [])
    expect(days.every((d) => d.entries.length === 0)).toBe(true)
  })
})
