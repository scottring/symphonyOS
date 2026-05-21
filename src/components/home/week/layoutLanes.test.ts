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

  it('assigns two overlapping items to lanes 0 and 1 with laneCount 2', () => {
    const a = makeItem({
      id: 'a',
      start: new Date('2026-05-18T09:00:00'),
      end: new Date('2026-05-18T10:00:00'),
    })
    const b = makeItem({
      id: 'b',
      start: new Date('2026-05-18T09:30:00'),
      end: new Date('2026-05-18T10:30:00'),
    })
    const placed = layoutWeekLanes([a, b], weekStart, 7)
    expect(placed).toHaveLength(2)

    const placedA = placed.find(p => p.item.id === 'a')!
    const placedB = placed.find(p => p.item.id === 'b')!
    expect(placedA.laneIdx).toBe(0)
    expect(placedB.laneIdx).toBe(1)
    expect(placedA.laneCount).toBe(2)
    expect(placedB.laneCount).toBe(2)
  })

  it('keeps non-overlapping items at laneCount 1 (separate clusters)', () => {
    const a = makeItem({
      id: 'a',
      start: new Date('2026-05-18T09:00:00'),
      end: new Date('2026-05-18T10:00:00'),
    })
    const b = makeItem({
      id: 'b',
      start: new Date('2026-05-18T11:00:00'),
      end: new Date('2026-05-18T12:00:00'),
    })
    const placed = layoutWeekLanes([a, b], weekStart, 7)
    expect(placed.find(p => p.item.id === 'a')!.laneCount).toBe(1)
    expect(placed.find(p => p.item.id === 'b')!.laneCount).toBe(1)
  })

  it('produces 3 lanes when 3 items are concurrent', () => {
    // All three active at 10:00–10:30.
    const a = makeItem({ id: 'a', start: new Date('2026-05-18T09:00:00'), end: new Date('2026-05-18T11:00:00') })
    const b = makeItem({ id: 'b', start: new Date('2026-05-18T09:30:00'), end: new Date('2026-05-18T10:30:00') })
    const c = makeItem({ id: 'c', start: new Date('2026-05-18T10:00:00'), end: new Date('2026-05-18T10:45:00') })
    const placed = layoutWeekLanes([a, b, c], weekStart, 7)
    const counts = new Set(placed.map(p => p.laneCount))
    expect(counts).toEqual(new Set([3]))
    expect(placed.find(p => p.item.id === 'a')!.laneIdx).toBe(0)
    expect(placed.find(p => p.item.id === 'b')!.laneIdx).toBe(1)
    expect(placed.find(p => p.item.id === 'c')!.laneIdx).toBe(2)
  })

  it('compresses chain overlaps to fewer lanes when lanes free up', () => {
    // a: 9–10, b: 9:30–10:30, c: 10:15–11. Max concurrent = 2.
    // c can reuse lane 0 after a ends at 10:00.
    const a = makeItem({ id: 'a', start: new Date('2026-05-18T09:00:00'), end: new Date('2026-05-18T10:00:00') })
    const b = makeItem({ id: 'b', start: new Date('2026-05-18T09:30:00'), end: new Date('2026-05-18T10:30:00') })
    const c = makeItem({ id: 'c', start: new Date('2026-05-18T10:15:00'), end: new Date('2026-05-18T11:00:00') })
    const placed = layoutWeekLanes([a, b, c], weekStart, 7)
    const counts = new Set(placed.map(p => p.laneCount))
    expect(counts).toEqual(new Set([2]))
    expect(placed.find(p => p.item.id === 'a')!.laneIdx).toBe(0)
    expect(placed.find(p => p.item.id === 'b')!.laneIdx).toBe(1)
    expect(placed.find(p => p.item.id === 'c')!.laneIdx).toBe(0) // reuses lane 0
  })

  it('treats two routines at the same time as overlapping (30-min default)', () => {
    // Both routines have endTime null → effective end = startMin + 30.
    // Same startMin → overlap → lane 1 for the second.
    const a = makeItem({
      id: 'routine-a',
      type: 'routine',
      start: new Date('2026-05-18T19:00:00'),
      end: null,
    })
    const b = makeItem({
      id: 'routine-b',
      type: 'routine',
      start: new Date('2026-05-18T19:00:00'),
      end: null,
    })
    const placed = layoutWeekLanes([a, b], weekStart, 7)
    expect(placed).toHaveLength(2)
    expect(new Set(placed.map(p => p.laneCount))).toEqual(new Set([2]))
    expect(new Set(placed.map(p => p.laneIdx))).toEqual(new Set([0, 1]))
  })

  it('treats two routines 31 minutes apart as non-overlapping', () => {
    // 19:00 → effective end 19:30. 19:31 starts after → separate cluster.
    const a = makeItem({ id: 'a', type: 'routine', start: new Date('2026-05-18T19:00:00'), end: null })
    const b = makeItem({ id: 'b', type: 'routine', start: new Date('2026-05-18T19:31:00'), end: null })
    const placed = layoutWeekLanes([a, b], weekStart, 7)
    expect(placed.find(p => p.item.id === 'a')!.laneCount).toBe(1)
    expect(placed.find(p => p.item.id === 'b')!.laneCount).toBe(1)
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
