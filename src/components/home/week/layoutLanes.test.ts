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

  it('backgrounds a containing item and lane-splits the two inside it', () => {
    // All three active at 10:00–10:30, but a's interval contains b and c —
    // a becomes a full-width container (embedded-blocks design, 2026-09-01)
    // and only b/c compete for lanes.
    const a = makeItem({ id: 'a', start: new Date('2026-05-18T09:00:00'), end: new Date('2026-05-18T11:00:00') })
    const b = makeItem({ id: 'b', start: new Date('2026-05-18T09:30:00'), end: new Date('2026-05-18T10:30:00') })
    const c = makeItem({ id: 'c', start: new Date('2026-05-18T10:00:00'), end: new Date('2026-05-18T10:45:00') })
    const placed = layoutWeekLanes([a, b, c], weekStart, 7)
    const p = Object.fromEntries(placed.map((x) => [x.item.id, x]))
    expect(p.a).toMatchObject({ laneIdx: 0, laneCount: 1, isContainer: true })
    expect(p.b.laneCount).toBe(2)
    expect(p.c.laneCount).toBe(2)
    expect(p.b.laneIdx).not.toBe(p.c.laneIdx)
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

  it('excludes items on day >= dayCount (workweek filters Sat/Sun)', () => {
    // weekStart is Monday 2026-05-18. Saturday is dayIdx 5.
    const monday = makeItem({
      id: 'mon',
      start: new Date('2026-05-18T09:00:00'),
      end: new Date('2026-05-18T10:00:00'),
    })
    const saturday = makeItem({
      id: 'sat',
      start: new Date('2026-05-23T09:00:00'),
      end: new Date('2026-05-23T10:00:00'),
    })
    const placed = layoutWeekLanes([monday, saturday], weekStart, 5)
    expect(placed).toHaveLength(1)
    expect(placed[0].item.id).toBe('mon')
  })

  it('includes Saturday when dayCount=7', () => {
    const saturday = makeItem({
      id: 'sat',
      start: new Date('2026-05-23T09:00:00'),
      end: new Date('2026-05-23T10:00:00'),
    })
    const placed = layoutWeekLanes([saturday], weekStart, 7)
    expect(placed).toHaveLength(1)
    expect(placed[0].dayIdx).toBe(5)
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

describe('layoutWeekLanes — embedded blocks', () => {
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
    } as unknown as import('@/types/timeline').TimelineItem
  }

  it('keeps a containing block full-width and embeds the contained item', () => {
    const school = makeItem({
      id: 'school', type: 'event',
      start: new Date('2026-05-18T08:00:00'), end: new Date('2026-05-18T15:00:00'),
    })
    const golf = makeItem({
      id: 'golf',
      start: new Date('2026-05-18T09:00:00'), end: new Date('2026-05-18T09:30:00'),
    })
    const placed = layoutWeekLanes([school, golf], weekStart, 7)
    const p = Object.fromEntries(placed.map((x) => [x.item.id, x]))
    expect(p.school).toMatchObject({ laneIdx: 0, laneCount: 1, isContainer: true })
    expect(p.golf).toMatchObject({ laneIdx: 0, laneCount: 1, embedded: true })
  })

  it('lane-splits overlapping embedded items among themselves only', () => {
    const school = makeItem({
      id: 'school', type: 'event',
      start: new Date('2026-05-18T08:00:00'), end: new Date('2026-05-18T15:00:00'),
    })
    const a = makeItem({
      id: 'a',
      start: new Date('2026-05-18T09:00:00'), end: new Date('2026-05-18T10:00:00'),
    })
    const b = makeItem({
      id: 'b',
      start: new Date('2026-05-18T09:30:00'), end: new Date('2026-05-18T10:30:00'),
    })
    const placed = layoutWeekLanes([school, a, b], weekStart, 7)
    const p = Object.fromEntries(placed.map((x) => [x.item.id, x]))
    expect(p.school.laneCount).toBe(1)
    expect(p.a.laneCount).toBe(2)
    expect(p.b.laneCount).toBe(2)
    expect(p.a.laneIdx).not.toBe(p.b.laneIdx)
  })

  it('floors items in a container title band below the title line', () => {
    const school = makeItem({
      id: 'school', type: 'event',
      start: new Date('2026-05-18T08:00:00'), end: new Date('2026-05-18T15:00:00'),
    })
    // Contained, starting at the container top — would cover the title.
    const special = makeItem({
      id: 'special', type: 'event',
      start: new Date('2026-05-18T08:00:00'), end: new Date('2026-05-18T08:30:00'),
    })
    // NOT contained (starts before the container) but still overlaps the
    // title band once the grid clamps it to the top.
    const early = makeItem({
      id: 'early', type: 'routine',
      start: new Date('2026-05-18T07:40:00'), end: new Date('2026-05-18T08:10:00'),
    })
    const later = makeItem({
      id: 'later',
      start: new Date('2026-05-18T09:00:00'), end: new Date('2026-05-18T09:30:00'),
    })
    const placed = layoutWeekLanes([school, special, early, later], weekStart, 7)
    const p = Object.fromEntries(placed.map((x) => [x.item.id, x]))
    expect(p.special.clearedTopMin).toBe(8 * 60 + 20)
    expect(p.early.clearedTopMin).toBe(8 * 60 + 20)
    expect(p.later.clearedTopMin).toBeUndefined()
    expect(p.school.clearedTopMin).toBeUndefined()
  })

  it('floors deeper below a container that carries a subtitle', () => {
    const school = {
      ...makeItem({
        id: 'school', type: 'event',
        start: new Date('2026-05-18T08:00:00'), end: new Date('2026-05-18T15:00:00'),
      }),
      subtitle: 'Ella: Library · Kaleb: Music',
    }
    const feed = makeItem({
      id: 'feed', type: 'routine',
      start: new Date('2026-05-18T08:00:00'), end: new Date('2026-05-18T08:30:00'),
    })
    const placed = layoutWeekLanes([school, feed], weekStart, 7)
    const p = Object.fromEntries(placed.map((x) => [x.item.id, x]))
    expect(p.feed.clearedTopMin).toBe(8 * 60 + 34)
  })

  it('floors a pre-grid item that only overlaps the container after top-clamping', () => {
    const school = makeItem({
      id: 'school', type: 'event',
      start: new Date('2026-05-18T08:00:00'), end: new Date('2026-05-18T15:00:00'),
    })
    const golf = makeItem({
      id: 'golf',
      start: new Date('2026-05-18T09:00:00'), end: new Date('2026-05-18T09:30:00'),
    })
    // Ends exactly at the container start — no time overlap, but the grid
    // clamps it to the top edge where it would cover the container title.
    const preGrid = makeItem({
      id: 'preGrid', type: 'event',
      start: new Date('2026-05-18T07:30:00'), end: new Date('2026-05-18T08:00:00'),
    })
    const clamped = layoutWeekLanes([school, golf, preGrid], weekStart, 7, 8 * 60)
    const pc = Object.fromEntries(clamped.map((x) => [x.item.id, x]))
    expect(pc.preGrid.clearedTopMin).toBe(8 * 60 + 20)

    const unclamped = layoutWeekLanes([school, golf, preGrid], weekStart, 7)
    const pu = Object.fromEntries(unclamped.map((x) => [x.item.id, x]))
    expect(pu.preGrid.clearedTopMin).toBeUndefined()
  })

  it('still lane-splits partial overlaps that are not contained', () => {
    const a = makeItem({
      id: 'a', type: 'event',
      start: new Date('2026-05-18T09:00:00'), end: new Date('2026-05-18T11:00:00'),
    })
    const b = makeItem({
      id: 'b', type: 'event',
      start: new Date('2026-05-18T10:00:00'), end: new Date('2026-05-18T12:00:00'),
    })
    const placed = layoutWeekLanes([a, b], weekStart, 7)
    const p = Object.fromEntries(placed.map((x) => [x.item.id, x]))
    expect(p.a.laneCount).toBe(2)
    expect(p.b.laneCount).toBe(2)
    expect(p.a.embedded).toBeFalsy()
    expect(p.b.embedded).toBeFalsy()
  })
})
