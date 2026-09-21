import { describe, it, expect } from 'vitest'
import { unhomedRoutines, type UnhomedCtx } from './unhomedRoutines'
import { createMockRoutine, createMockActionableInstance } from '@/test/mocks/factories'
import { ALL_LAYERS } from '@/lib/domains'
import type { RecurrencePattern } from '@/types/actionable'

const ctx: UnhomedCtx = { prefs: { hideRoutines: false, layers: ALL_LAYERS } }

describe('unhomedRoutines', () => {
  it('a routine with a day but no time has a home: its day', () => {
    const daily = createMockRoutine({ name: 'Trash night', time_of_day: null })
    const saturday = createMockRoutine({
      name: 'Do kitchen laundry',
      time_of_day: null,
      recurrence_pattern: { type: 'weekly', days: ['sat'] } as RecurrencePattern,
    })
    expect(unhomedRoutines([daily, saturday], ctx)).toEqual([])
  })

  it('keeps weekly routines with no days and no time', () => {
    const r = createMockRoutine({ name: 'Trash night', time_of_day: null, recurrence_pattern: { type: 'weekly' } as RecurrencePattern })
    expect(unhomedRoutines([r], ctx)).toEqual([r])
  })

  it('keeps weekly routines with no days even when timed', () => {
    const r = createMockRoutine({
      name: 'Water plants',
      time_of_day: '17:00',
      recurrence_pattern: { type: 'weekly' } as RecurrencePattern,
    })
    expect(unhomedRoutines([r], ctx)).toEqual([r])
  })

  it('drops routines that already have a home', () => {
    const daily = createMockRoutine({ time_of_day: '07:00' })
    const weekly = createMockRoutine({
      time_of_day: '18:30',
      recurrence_pattern: { type: 'weekly', days: ['tue'] } as RecurrencePattern,
    })
    expect(unhomedRoutines([daily, weekly], ctx)).toEqual([])
  })

  it('drops routines the resolver ladder would hide (resting)', () => {
    const r = createMockRoutine({ time_of_day: null, visibility: 'reference', recurrence_pattern: { type: 'weekly' } as RecurrencePattern })
    expect(unhomedRoutines([r], ctx)).toEqual([])
  })

  // "Give it a day" places ONE week's occurrence. For that week the routine
  // has a home and leaves the list; next week it is back (Scott, 2026-09-21).
  describe('placed this week', () => {
    const r = createMockRoutine({ id: 'r1', name: 'Take out recycling', time_of_day: null, recurrence_pattern: { type: 'weekly' } as RecurrencePattern })
    const sun = new Date(2026, 8, 27)
    it('drops a routine placed on a day of the week being planned', () => {
      const placed = createMockActionableInstance({ entity_id: 'r1', date: '2026-09-27', status: 'pending', deferred_to: new Date(2026, 8, 27, 9).toISOString() })
      expect(unhomedRoutines([r], ctx, { weekStart: sun, instances: [placed] })).toEqual([])
    })
    it('keeps it for a week it was not placed in', () => {
      const placed = createMockActionableInstance({ entity_id: 'r1', date: '2026-09-27', status: 'pending', deferred_to: new Date(2026, 8, 27, 9).toISOString() })
      const nextSun = new Date(2026, 9, 4)
      expect(unhomedRoutines([r], ctx, { weekStart: nextSun, instances: [placed] })).toEqual([r])
      expect(unhomedRoutines([r], ctx, { weekStart: new Date(2026, 8, 20), instances: [placed] })).toEqual([r])
    })
    it('a skip is not a home; a tick is', () => {
      const skipped = createMockActionableInstance({ entity_id: 'r1', date: '2026-09-29', status: 'skipped', deferred_to: new Date(2026, 8, 29, 9).toISOString() })
      expect(unhomedRoutines([r], ctx, { weekStart: sun, instances: [skipped] })).toEqual([r])
      const done = createMockActionableInstance({ entity_id: 'r1', date: '2026-09-29', status: 'completed' })
      expect(unhomedRoutines([r], ctx, { weekStart: sun, instances: [done] })).toEqual([])
    })
  })
})
