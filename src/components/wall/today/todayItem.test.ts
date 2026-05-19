import { describe, it, expect } from 'vitest'
import { buildTodayItems } from './todayItem'
import type { TimelineItem } from '@/types/timeline'
import type { DaySection } from '@/lib/timeUtils'

const mkItem = (overrides: Partial<TimelineItem> = {}): TimelineItem => ({
  id: 'x',
  type: 'task',
  title: 'Title',
  startTime: null,
  endTime: null,
  completed: false,
  ...overrides,
})

function sections(items: TimelineItem[]): Record<DaySection, TimelineItem[]> {
  return { allday: [], morning: items, afternoon: [], evening: [], unscheduled: [] }
}

function tl(over: Partial<TimelineItem>): TimelineItem {
  return {
    id: 'x', title: 'x', type: 'routine', completed: false,
    startTime: new Date('2026-05-19T06:00:00'), ...over,
  } as unknown as TimelineItem
}

describe('buildTodayItems', () => {
  it('returns empty for empty input', () => {
    expect(buildTodayItems({ allday: [], morning: [], afternoon: [], evening: [] })).toEqual([])
  })

  it('maps tasks to kind=task', () => {
    const items = buildTodayItems({
      allday: [mkItem({ id: 't1', type: 'task', title: 'Run', assignedTo: 'm1' })],
      morning: [],
      afternoon: [],
      evening: [],
    })
    expect(items[0]).toMatchObject({ id: 't1', kind: 'task', title: 'Run', ownerId: 'm1' })
  })

  it('maps events to kind=event', () => {
    const items = buildTodayItems({
      allday: [],
      morning: [mkItem({ id: 'e1', type: 'event', title: 'Meeting', startTime: new Date() })],
      afternoon: [],
      evening: [],
    })
    expect(items[0].kind).toBe('event')
  })

  it('maps routines to kind=routine-step', () => {
    const items = buildTodayItems({
      allday: [],
      morning: [mkItem({ id: 'r1', type: 'routine', title: 'Brush teeth' })],
      afternoon: [],
      evening: [],
    })
    expect(items[0].kind).toBe('routine-step')
  })

  it('maps category=chore tasks to kind=chore', () => {
    const items = buildTodayItems({
      allday: [mkItem({ id: 'c1', type: 'task', category: 'chore', title: 'Trash' })],
      morning: [],
      afternoon: [],
      evening: [],
    })
    expect(items[0].kind).toBe('chore')
  })

  it('sorts items by startTime, with timeless items first', () => {
    const items = buildTodayItems({
      allday: [
        mkItem({ id: '7pm', startTime: new Date('2026-05-17T19:00:00') }),
        mkItem({ id: 'no-time', startTime: null }),
        mkItem({ id: '5pm', startTime: new Date('2026-05-17T17:00:00') }),
      ],
      morning: [],
      afternoon: [],
      evening: [],
    })
    expect(items.map(i => i.id)).toEqual(['no-time', '5pm', '7pm'])
  })

  it('filters by selected ownerId when provided', () => {
    const items = buildTodayItems(
      {
        allday: [
          mkItem({ id: 'a', assignedTo: 'm1' }),
          mkItem({ id: 'b', assignedTo: 'm2' }),
        ],
        morning: [],
        afternoon: [],
        evening: [],
      },
      'm1',
    )
    expect(items.map(i => i.id)).toEqual(['a'])
  })

  it('keeps unowned items when filtered by owner', () => {
    const items = buildTodayItems(
      {
        allday: [
          mkItem({ id: 'a', assignedTo: 'm1' }),
          mkItem({ id: 'b', assignedTo: undefined }),
        ],
        morning: [],
        afternoon: [],
        evening: [],
      },
      'm1',
    )
    expect(items.map(i => i.id).sort()).toEqual(['a', 'b'])
  })
})

describe('buildTodayItems isEverydayRoutine flag', () => {
  it('flags a daily routine step as everyday', () => {
    const items = buildTodayItems(sections([
      tl({ id: 'r1', title: 'Brush teeth', type: 'routine', recurrencePattern: { type: 'daily' } as never }),
    ]))
    expect(items[0].kind).toBe('routine-step')
    expect(items[0].isEverydayRoutine).toBe(true)
  })

  it('does not flag a weekly Tue/Thu routine as everyday', () => {
    const items = buildTodayItems(sections([
      tl({ id: 'r2', title: 'Soccer', type: 'routine', recurrencePattern: { type: 'weekly', days: ['tue', 'thu'] } as never }),
    ]))
    expect(items[0].isEverydayRoutine).toBe(false)
  })

  it('leaves non-routine items undefined', () => {
    const items = buildTodayItems(sections([
      tl({ id: 't1', title: 'Pay bill', type: 'task', recurrencePattern: undefined }),
    ]))
    expect(items[0].kind).toBe('task')
    expect(items[0].isEverydayRoutine).toBeUndefined()
  })
})
