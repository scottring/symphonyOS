import { describe, it, expect } from 'vitest'
import type { Routine } from '@/types/actionable'
import { parseRoutineTimelineId, routineStatusKey, expandRoutineDoses } from './doseExpansion'

function routine(over: Partial<Routine> = {}): Routine {
  return {
    id: 'r1', user_id: 'u1', name: 'Median nerve glide', description: null,
    default_assignee: null, assigned_to: null, assigned_to_all: null,
    visibility: 'active', paused_until: null,
    recurrence_pattern: { type: 'daily' }, time_of_day: null,
    times_per_day: null, image_url: null,
    raw_input: null, show_on_timeline: true,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

describe('parseRoutineTimelineId', () => {
  it('bare id has null slot', () => {
    expect(parseRoutineTimelineId('routine-abc')).toEqual({ routineId: 'abc', slot: null })
  })
  it('slotted id parses the slot', () => {
    expect(parseRoutineTimelineId('routine-abc#2')).toEqual({ routineId: 'abc', slot: 2 })
  })
})

describe('routineStatusKey', () => {
  it('null slot → bare routine id (back-compat with existing instances)', () => {
    expect(routineStatusKey('abc', null)).toBe('abc')
  })
  it('slot → slotted key', () => {
    expect(routineStatusKey('abc', 1)).toBe('abc#1')
  })
})

describe('expandRoutineDoses', () => {
  it('no times_per_day → single bare slot, time from time_of_day', () => {
    const doses = expandRoutineDoses(routine({ time_of_day: '08:00:00' }))
    expect(doses).toEqual([{ slotId: 'routine-r1', slotIndex: null, time: '08:00' }])
  })
  it('two doses → two slotted entries in order', () => {
    const doses = expandRoutineDoses(routine({ times_per_day: ['09:00', '18:00'] }))
    expect(doses).toEqual([
      { slotId: 'routine-r1#0', slotIndex: 0, time: '09:00' },
      { slotId: 'routine-r1#1', slotIndex: 1, time: '18:00' },
    ])
  })
})

describe('dosed routine → bare id for detail panel lookup', () => {
  it('slotted timeline id yields bare routineId (not rx#0) for row lookup', () => {
    // If handleSelectItem stripped on the first dash instead of using
    // parseRoutineTimelineId, id would be "rx#0" and routines.find would fail.
    const slotted = 'routine-rx#0'
    const { routineId } = parseRoutineTimelineId(slotted)
    expect(routineId).toBe('rx')
    expect(routineId).not.toContain('#')
  })
  it('bare timeline id also yields bare routineId', () => {
    const bare = 'routine-rx'
    const { routineId } = parseRoutineTimelineId(bare)
    expect(routineId).toBe('rx')
  })
})
