import { describe, it, expect } from 'vitest'
import { resolveRoutineTime } from './routineTime'
import type { ActionableInstance } from '@/types/actionable'

const viewedDate = new Date(2026, 7, 1) // Sat Aug 1 2026, local
const at = (h: number, m = 0) => new Date(2026, 7, 1, h, m, 0, 0)

function instance(over: Partial<ActionableInstance> = {}): ActionableInstance {
  return {
    id: 'i1', user_id: 'u1', entity_type: 'routine', entity_id: 'r1',
    date: '2026-08-01', status: 'pending', deferred_to: null,
    created_at: '', updated_at: '',
    ...over,
  } as ActionableInstance
}

describe('resolveRoutineTime', () => {
  it('uses the rule time when there is no override', () => {
    expect(resolveRoutineTime({ time_of_day: '09:00' }, undefined, viewedDate))
      .toEqual(at(9, 0))
  })

  // The drag writes a one-day override rather than rewriting recurrence, so the
  // override has to win over the rule — otherwise the drop silently reverts.
  it('prefers a same-day pending override over the rule time', () => {
    const i = instance({ deferred_to: at(14, 30).toISOString() })
    expect(resolveRoutineTime({ time_of_day: '19:30' }, i, viewedDate))
      .toEqual(at(14, 30))
  })

  // The drawer only offers untimed routines, so this is the ONLY way a routine
  // dragged from the drawer can ever land on the grid.
  it('gives an untimed routine a time when it has an override', () => {
    const i = instance({ deferred_to: at(10, 30).toISOString() })
    expect(resolveRoutineTime({ time_of_day: null }, i, viewedDate))
      .toEqual(at(10, 30))
  })

  it('returns null for an untimed routine with no override', () => {
    expect(resolveRoutineTime({ time_of_day: null }, undefined, viewedDate)).toBeNull()
    expect(resolveRoutineTime({ time_of_day: null }, instance(), viewedDate)).toBeNull()
  })

  it('applies a deferred override on the day it was deferred to', () => {
    const i = instance({ status: 'deferred', deferred_to: at(16, 0).toISOString() })
    expect(resolveRoutineTime({ time_of_day: '09:00' }, i, viewedDate)).toEqual(at(16, 0))
  })

  // A routine moved to another day is not on this one at all. Falling back to
  // the rule time here leaves a ghost sitting on the day it left, while the day
  // it moved to also has to draw it — the same routine twice.
  it('returns null on days a routine was deferred AWAY from, without falling back', () => {
    const i = instance({ status: 'deferred', deferred_to: at(16, 0).toISOString() })
    const otherDay = new Date(2026, 7, 2)
    expect(resolveRoutineTime({ time_of_day: '09:00' }, i, otherDay)).toBeNull()
  })

  it('ignores an override on a completed or skipped instance', () => {
    for (const status of ['completed', 'skipped'] as const) {
      const i = instance({ status, deferred_to: at(14, 30).toISOString() })
      expect(resolveRoutineTime({ time_of_day: '09:00' }, i, viewedDate)).toEqual(at(9, 0))
    }
  })

  it('parses a rule time carrying seconds', () => {
    // Postgres `time` columns come back as "19:30:00", not "19:30".
    expect(resolveRoutineTime({ time_of_day: '19:30:00' }, undefined, viewedDate))
      .toEqual(at(19, 30))
  })
})
