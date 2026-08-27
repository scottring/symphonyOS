import { describe, it, expect } from 'vitest'
import { deferredInRoutineIds } from './deferredRoutines'
import type { ActionableInstance } from '@/types/actionable'

const VIEWED = new Date('2026-08-24T09:00:00')
const VIEWED_STR = '2026-08-24'
const YESTERDAY_STR = '2026-08-23'

function instance(p: Partial<ActionableInstance>): ActionableInstance {
  return {
    id: 'i', user_id: 'u', entity_type: 'routine', entity_id: 'r1',
    date: YESTERDAY_STR, status: 'deferred', assignee: null, assigned_to_override: null,
    deferred_to: null, completed_at: null, skipped_at: null, created_at: '', updated_at: '',
    ...p,
  }
}

describe('deferredInRoutineIds', () => {
  it('includes a routine deferred from a different day onto the viewed date', () => {
    const deferredTo = new Date(`${VIEWED_STR}T15:00:00Z`).toISOString()
    const ids = deferredInRoutineIds([instance({ entity_id: 'r1', date: YESTERDAY_STR, deferred_to: deferredTo })], VIEWED)
    expect(ids.has('r1')).toBe(true)
  })

  it('excludes a same-day deferral (a retime, not a cross-day placement)', () => {
    const deferredTo = new Date(`${VIEWED_STR}T15:00:00Z`).toISOString()
    const ids = deferredInRoutineIds([instance({ entity_id: 'r1', date: VIEWED_STR, deferred_to: deferredTo })], VIEWED)
    expect(ids.has('r1')).toBe(false)
  })

  it('excludes a routine deferred to some OTHER date', () => {
    const deferredTo = new Date('2026-09-01T15:00:00Z').toISOString()
    const ids = deferredInRoutineIds([instance({ entity_id: 'r1', date: YESTERDAY_STR, deferred_to: deferredTo })], VIEWED)
    expect(ids.has('r1')).toBe(false)
  })

  it('ignores non-routine instances', () => {
    const deferredTo = new Date(`${VIEWED_STR}T15:00:00Z`).toISOString()
    const ids = deferredInRoutineIds(
      [instance({ entity_id: 'e1', entity_type: 'calendar_event', date: YESTERDAY_STR, deferred_to: deferredTo })],
      VIEWED,
    )
    expect(ids.has('e1')).toBe(false)
  })

  it('ignores an instance with no deferred_to', () => {
    const ids = deferredInRoutineIds([instance({ entity_id: 'r1', deferred_to: null })], VIEWED)
    expect(ids.has('r1')).toBe(false)
  })

  it('counts regardless of status — a completed or skipped deferral still placed the routine here', () => {
    const deferredTo = new Date(`${VIEWED_STR}T15:00:00Z`).toISOString()
    const ids = deferredInRoutineIds(
      [instance({ entity_id: 'r1', date: YESTERDAY_STR, deferred_to: deferredTo, status: 'completed' })],
      VIEWED,
    )
    expect(ids.has('r1')).toBe(true)
  })

  it('returns an empty set for no instances', () => {
    expect(deferredInRoutineIds([], VIEWED).size).toBe(0)
  })
})
