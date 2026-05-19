import { describe, it, expect } from 'vitest'
import { buildRoutineStatusMap, buildEventStatusMap, selectVisibleRoutines } from './statusMaps'
import type { ActionableInstance, Routine } from '@/types/actionable'

function inst(p: Partial<ActionableInstance>): ActionableInstance {
  return { entity_type: 'routine', entity_id: 'r1', status: 'pending', deferred_to: null, ...p } as ActionableInstance
}

describe('statusMaps', () => {
  it('routine status map prefers completed > skipped > deferred > pending', () => {
    const m = buildRoutineStatusMap([
      inst({ entity_id: 'r1', status: 'deferred' }),
      inst({ entity_id: 'r1', status: 'completed' }),
      inst({ entity_id: 'r1', status: 'pending' }),
    ])
    expect(m.get('r1')?.status).toBe('completed')
  })
  it('routine status map ignores non-routine instances', () => {
    const m = buildRoutineStatusMap([inst({ entity_type: 'calendar_event', entity_id: 'e1' })])
    expect(m.size).toBe(0)
  })
  it('event status map keeps calendar_event instances only', () => {
    const m = buildEventStatusMap([
      inst({ entity_type: 'calendar_event', entity_id: 'e1', status: 'completed' }),
      inst({ entity_type: 'routine', entity_id: 'r1' }),
    ])
    expect(m.get('e1')?.status).toBe('completed')
    expect(m.size).toBe(1)
  })
  it('visible routines: show_on_timeline!==false, and hideRoutines drops everyday', () => {
    const daily = { id: 'd', show_on_timeline: true, recurrence_pattern: { type: 'daily' } } as unknown as Routine
    const weekly = { id: 'w', show_on_timeline: true, recurrence_pattern: { type: 'weekly', days: ['tue'] } } as unknown as Routine
    const hidden = { id: 'h', show_on_timeline: false } as unknown as Routine
    expect(selectVisibleRoutines([daily, weekly, hidden], false).map(r => r.id)).toEqual(['d', 'w'])
    expect(selectVisibleRoutines([daily, weekly, hidden], true).map(r => r.id)).toEqual(['w'])
  })
})
