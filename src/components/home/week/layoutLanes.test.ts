import { describe, it, expect } from 'vitest'
import { layoutWeekLanes, getEffectiveEndMin } from './layoutLanes'

describe('layoutWeekLanes', () => {
  const weekStart = new Date('2026-05-18T00:00:00') // Monday

  function makeItem(opts: {
    id: string
    start: Date
    end?: Date | null
    type?: 'task' | 'event' | 'routine'
  }): import('@/types/timeline').TimelineItem {
    return {
      id: opts.id,
      type: opts.type ?? 'task',
      title: opts.id,
      startTime: opts.start,
      endTime: opts.end ?? null,
      completed: false,
      notes: undefined,
      context: null,
      recurrencePattern: null,
      assignedTo: null,
    } as unknown as import('@/types/timeline').TimelineItem
  }

  it('returns empty array for empty input', () => {
    expect(layoutWeekLanes([], weekStart, 7)).toEqual([])
  })

  it('places a single item in lane 0 with laneCount 1', () => {
    const item = makeItem({
      id: 'a',
      start: new Date('2026-05-18T09:00:00'), // Monday 9 AM
      end: new Date('2026-05-18T10:00:00'),
    })
    const placed = layoutWeekLanes([item], weekStart, 7)
    expect(placed).toHaveLength(1)
    expect(placed[0]).toMatchObject({
      item,
      dayIdx: 0,
      laneIdx: 0,
      laneCount: 1,
    })
  })
})

describe('getEffectiveEndMin', () => {
  it('returns startMin + 30 when endTime is null (routine default)', () => {
    const start = new Date('2026-05-18T19:00:00')
    expect(getEffectiveEndMin(start, null)).toBe(19 * 60 + 30)
  })

  it('returns endMin when endTime is a valid later Date', () => {
    const start = new Date('2026-05-18T09:00:00')
    const end = new Date('2026-05-18T10:30:00')
    expect(getEffectiveEndMin(start, end)).toBe(10 * 60 + 30)
  })

  it('returns startMin + 15 when endTime is earlier than startTime (inverted)', () => {
    const start = new Date('2026-05-18T09:00:00')
    const end = new Date('2026-05-18T08:00:00')
    expect(getEffectiveEndMin(start, end)).toBe(9 * 60 + 15)
  })

  it('returns startMin + 15 when endTime equals startTime (zero-length)', () => {
    const start = new Date('2026-05-18T09:00:00')
    const end = new Date('2026-05-18T09:00:00')
    expect(getEffectiveEndMin(start, end)).toBe(9 * 60 + 15)
  })
})
