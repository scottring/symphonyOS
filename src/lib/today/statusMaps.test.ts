import { describe, it, expect } from 'vitest'
import { ALL_LAYERS } from '@/lib/domains'
import { buildRoutineStatusMap, buildEventStatusMap, selectVisibleRoutines } from './statusMaps'
import type { ActionableInstance, Routine } from '@/types/actionable'

function inst(p: Partial<ActionableInstance>): ActionableInstance {
  return { entity_type: 'routine', entity_id: 'r1', status: 'pending', deferred_to: null, ...p } as ActionableInstance
}

// Tuesday — the 'weekly' fixture below (days:['tue']) needs a matching date
// now that selectVisibleRoutines applies rung 2 (date match) itself; the old
// boolean-only selectVisibleRoutines never looked at a date at all.
const DATE = new Date(2026, 7, 25)

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
    const daily = { id: 'd', visibility: 'active', show_on_timeline: true, recurrence_pattern: { type: 'daily' } } as unknown as Routine
    const weekly = { id: 'w', visibility: 'active', show_on_timeline: true, recurrence_pattern: { type: 'weekly', days: ['tue'] } } as unknown as Routine
    const hidden = { id: 'h', visibility: 'active', show_on_timeline: false, recurrence_pattern: { type: 'daily' } } as unknown as Routine
    expect(selectVisibleRoutines([daily, weekly, hidden], { date: DATE, prefs: { hideRoutines: false, layers: ALL_LAYERS } }).map(r => r.id)).toEqual(['d', 'w'])
    expect(selectVisibleRoutines([daily, weekly, hidden], { date: DATE, prefs: { hideRoutines: true, layers: ALL_LAYERS } }).map(r => r.id)).toEqual(['w'])
  })
  it('hideRoutines keeps collection parent and its steps visible when hide-daily is ON', () => {
    const parent = { id: 'col-parent', visibility: 'active', show_on_timeline: true, recurrence_pattern: { type: 'daily' } } as unknown as Routine
    const step = { id: 'col-step', visibility: 'active', show_on_timeline: true, recurrence_pattern: { type: 'daily' }, parent_routine_id: 'col-parent', times_per_day: ['09:00'] } as unknown as Routine
    const plainDaily = { id: 'plain', visibility: 'active', show_on_timeline: true, recurrence_pattern: { type: 'daily' } } as unknown as Routine
    const result = selectVisibleRoutines([parent, step, plainDaily], { date: DATE, prefs: { hideRoutines: true, layers: ALL_LAYERS } })
    const ids = result.map(r => r.id)
    expect(ids).toContain('col-parent')
    expect(ids).toContain('col-step')
    expect(ids).not.toContain('plain')
  })
  it('hideRoutines keeps pinned and dosed everyday routines on Today', () => {
    const plainDaily = { id: 'd', visibility: 'active', show_on_timeline: true, recurrence_pattern: { type: 'daily' } } as unknown as Routine
    const pinned = { id: 'p', visibility: 'active', show_on_timeline: true, recurrence_pattern: { type: 'daily' }, pin_to_timeline: true } as unknown as Routine
    const dosed = { id: 'x', visibility: 'active', show_on_timeline: true, recurrence_pattern: { type: 'daily' }, times_per_day: ['09:00', '18:00'] } as unknown as Routine
    // With hideRoutines on, the plain daily is swept but pinned + dosed survive.
    expect(selectVisibleRoutines([plainDaily, pinned, dosed], { date: DATE, prefs: { hideRoutines: true, layers: ALL_LAYERS } }).map(r => r.id)).toEqual(['p', 'x'])
    // A pinned routine that is explicitly hidden (show_on_timeline false) still stays off.
    const pinnedButHidden = { id: 'ph', visibility: 'active', show_on_timeline: false, recurrence_pattern: { type: 'daily' }, pin_to_timeline: true } as unknown as Routine
    expect(selectVisibleRoutines([pinnedButHidden], { date: DATE, prefs: { hideRoutines: true, layers: ALL_LAYERS } })).toEqual([])
  })
})
