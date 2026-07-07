import { describe, it, expect } from 'vitest'
import type { Routine } from '@/types/actionable'
import { groupRoutineSteps, buildCollectionItem } from './routineCollections'
import type { ActionableInstance } from '@/types/actionable'
import { weekdayKeyForDate, WEEKDAY_KEYS } from '@/lib/routineUtils'

function r(over: Partial<Routine>): Routine {
  return {
    id: 'r', user_id: 'u', name: 'R', description: null, default_assignee: null,
    assigned_to: null, assigned_to_all: null, visibility: 'active', paused_until: null,
    recurrence_pattern: { type: 'daily' }, time_of_day: null, times_per_day: null,
    image_url: null, raw_input: null, show_on_timeline: true,
    parent_routine_id: null, step_order: null,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

describe('groupRoutineSteps', () => {
  it('parentless childless routine is standalone', () => {
    const { collections, standalone } = groupRoutineSteps([r({ id: 'solo' })])
    expect(standalone.map(x => x.id)).toEqual(['solo'])
    expect(collections).toEqual([])
  })
  it('a routine with children becomes a collection; children are its ordered steps', () => {
    const parent = r({ id: 'hep', name: 'Shoulder HEP' })
    const s2 = r({ id: 's2', name: 'B', parent_routine_id: 'hep', step_order: 2 })
    const s1 = r({ id: 's1', name: 'A', parent_routine_id: 'hep', step_order: 1 })
    const { collections, standalone } = groupRoutineSteps([parent, s2, s1])
    expect(standalone).toEqual([])
    expect(collections).toHaveLength(1)
    expect(collections[0].id).toBe('hep')
    expect(collections[0].steps.map(s => s.id)).toEqual(['s1', 's2']) // ordered by step_order
  })
  it('null step_order sorts after ordered steps, tiebreak by time then name', () => {
    const parent = r({ id: 'p' })
    const ordered = r({ id: 'o', parent_routine_id: 'p', step_order: 1 })
    const lateA = r({ id: 'la', name: 'Z', parent_routine_id: 'p', step_order: null, time_of_day: '07:00' })
    const lateB = r({ id: 'lb', name: 'A', parent_routine_id: 'p', step_order: null, time_of_day: '07:00' })
    const { collections } = groupRoutineSteps([parent, lateA, lateB, ordered])
    expect(collections[0].steps.map(s => s.id)).toEqual(['o', 'lb', 'la']) // ordered; then null by time then name
  })
})

describe('buildCollectionItem', () => {
  const date = new Date('2026-06-24T00:00:00')
  it('one collapsed item; progress counts doses; next-up is earliest incomplete', () => {
    const collection = {
      ...r({ id: 'hep', name: 'Shoulder HEP' }),
      steps: [
        r({ id: 'chin', name: 'Chin Tuck', parent_routine_id: 'hep', times_per_day: ['07:00', '13:00'] }),
        r({ id: 'med', name: 'Median Nerve Glide', parent_routine_id: 'hep', times_per_day: ['09:00'] }),
      ],
    }
    // chin#0 (07:00) completed; chin#1 (13:00) + med#0 (09:00) pending
    const status = new Map<string, ActionableInstance>([
      ['chin#0', { entity_type: 'routine', entity_id: 'chin#0', status: 'completed' } as ActionableInstance],
    ])
    const item = buildCollectionItem(collection as any, date, status)
    expect(item.type).toBe('routine-collection')
    expect(item.id).toBe('routine-collection-hep')
    expect(item.collectionProgress).toEqual({ done: 1, total: 3 })
    expect(item.collectionNextUp?.time).toBe('09:00') // earliest incomplete across steps
    expect(item.collectionNextUp?.stepName).toBe('Median Nerve Glide')
    // One entry per exercise (name shows once), with its doses grouped — not one row per dose.
    expect(item.collectionSteps?.map(s => s.name)).toEqual(['Chin Tuck', 'Median Nerve Glide'])
    expect(item.collectionSteps?.[0].doses.map(d => d.id)).toEqual(['routine-chin#0', 'routine-chin#1'])
    expect(item.collectionSteps?.[0].doses[0].completed).toBe(true) // chin#0 completed
    expect(item.collectionSteps?.[0].doses[1].completed).toBe(false) // chin#1 pending
    expect(item.collectionSteps?.[0].progress).toEqual({ done: 1, total: 2 })
    expect(item.collectionSteps?.[1].doses.map(d => d.id)).toEqual(['routine-med#0'])
    expect(item.completed).toBe(false)
  })
  it('all doses done → completed, anchored at earliest dose', () => {
    const collection = { ...r({ id: 'c', name: 'C' }), steps: [r({ id: 's', name: 'S', parent_routine_id: 'c', time_of_day: '08:00' })] }
    const status = new Map<string, ActionableInstance>([['s', { entity_type: 'routine', entity_id: 's', status: 'completed' } as ActionableInstance]])
    const item = buildCollectionItem(collection as any, date, status)
    expect(item.completed).toBe(true)
    expect(item.collectionProgress).toEqual({ done: 1, total: 1 })
    expect(item.collectionNextUp).toBeUndefined()
  })
  it('a skipped dose is resolved: anchor and next-up roll past it, but done count excludes it', () => {
    const collection = {
      ...r({ id: 'hep', name: 'Shoulder HEP' }),
      steps: [
        r({ id: 'chin', name: 'Chin Tuck', parent_routine_id: 'hep', times_per_day: ['07:00', '09:00'] }),
      ],
    }
    // 7am skipped, 9am pending → the block anchors at 9am, not the skipped 7am
    const status = new Map<string, ActionableInstance>([
      ['chin#0', { entity_type: 'routine', entity_id: 'chin#0', status: 'skipped' } as ActionableInstance],
    ])
    const item = buildCollectionItem(collection as any, date, status)
    expect(item.collectionNextUp?.time).toBe('09:00')
    expect(item.startTime?.getHours()).toBe(9)
    expect(item.collectionProgress).toEqual({ done: 0, total: 2 }) // skipped ≠ done
    expect(item.collectionSteps?.[0].doses[0].skipped).toBe(true)
    expect(item.collectionSteps?.[0].doses[0].completed).toBe(false)
    expect(item.completed).toBe(false)
  })
  it('completing the 7am dose rolls the anchor to the 9am dose', () => {
    const collection = {
      ...r({ id: 'hep', name: 'Shoulder HEP' }),
      steps: [
        r({ id: 'chin', name: 'Chin Tuck', parent_routine_id: 'hep', times_per_day: ['07:00', '09:00'] }),
      ],
    }
    const before = buildCollectionItem(collection as any, date, new Map())
    expect(before.startTime?.getHours()).toBe(7)

    const status = new Map<string, ActionableInstance>([
      ['chin#0', { entity_type: 'routine', entity_id: 'chin#0', status: 'completed' } as ActionableInstance],
    ])
    const after = buildCollectionItem(collection as any, date, status)
    expect(after.startTime?.getHours()).toBe(9)
    expect(after.collectionNextUp?.time).toBe('09:00')
  })
  it('all doses resolved (mix of done and skipped) → collection completed', () => {
    const collection = {
      ...r({ id: 'c', name: 'C' }),
      steps: [r({ id: 's', name: 'S', parent_routine_id: 'c', times_per_day: ['07:00', '09:00'] })],
    }
    const status = new Map<string, ActionableInstance>([
      ['s#0', { entity_type: 'routine', entity_id: 's#0', status: 'skipped' } as ActionableInstance],
      ['s#1', { entity_type: 'routine', entity_id: 's#1', status: 'completed' } as ActionableInstance],
    ])
    const item = buildCollectionItem(collection as any, date, status)
    expect(item.completed).toBe(true)
    expect(item.collectionProgress).toEqual({ done: 1, total: 2 })
    expect(item.collectionNextUp).toBeUndefined()
  })
  it('buildCollectionItem excludes steps whose day-override does not match the viewed date', () => {
    const viewed = new Date(2026, 0, 5) // Monday
    const key = weekdayKeyForDate(viewed)
    const otherKey = WEEKDAY_KEYS.find(k => k !== key)!
    const mk = (id: string, rp: Routine['recurrence_pattern']): Routine => ({
      ...r({ id, name: id, parent_routine_id: 'c1', step_order: 0, recurrence_pattern: rp }),
    })
    const collection = {
      ...r({ id: 'c1', name: 'Bedtime', recurrence_pattern: { type: 'daily' } }),
      steps: [
        mk('always', { type: 'daily' }),                       // inherits → shows
        mk('today', { type: 'weekly', days: [key] }),           // matches → shows
        mk('other', { type: 'weekly', days: [otherKey] }),      // excluded
      ],
    }
    const item = buildCollectionItem(collection as any, viewed, new Map())
    const ids = item.collectionSteps!.map(s => s.stepId)
    expect(ids).toContain('always')
    expect(ids).toContain('today')
    expect(ids).not.toContain('other')
    expect(item.collectionProgress.total).toBe(2)
  })
})
