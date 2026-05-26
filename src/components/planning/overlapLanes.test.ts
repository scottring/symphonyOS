import { describe, it, expect } from 'vitest'
import { assignOverlapLanes } from './overlapLanes'

describe('assignOverlapLanes', () => {
  it('gives non-overlapping items a single full-width lane', () => {
    const lanes = assignOverlapLanes([
      { id: 'a', startMinutes: 0, endMinutes: 30 },
      { id: 'b', startMinutes: 60, endMinutes: 90 },
    ])
    expect(lanes.get('a')).toEqual({ column: 0, totalColumns: 1 })
    expect(lanes.get('b')).toEqual({ column: 0, totalColumns: 1 })
  })

  it('splits two overlapping items into two side-by-side lanes', () => {
    const lanes = assignOverlapLanes([
      { id: 'a', startMinutes: 540, endMinutes: 600 }, // 9:00–10:00
      { id: 'b', startMinutes: 570, endMinutes: 630 }, // 9:30–10:30
    ])
    expect(lanes.get('a')).toEqual({ column: 0, totalColumns: 2 })
    expect(lanes.get('b')).toEqual({ column: 1, totalColumns: 2 })
  })

  it('groups transitively overlapping items into one group of three', () => {
    const lanes = assignOverlapLanes([
      { id: 'a', startMinutes: 540, endMinutes: 600 }, // 9:00–10:00
      { id: 'b', startMinutes: 570, endMinutes: 630 }, // 9:30–10:30 (overlaps a)
      { id: 'c', startMinutes: 615, endMinutes: 660 }, // 10:15–11:00 (overlaps b, not a)
    ])
    expect(lanes.get('a')?.totalColumns).toBe(3)
    expect(lanes.get('b')?.totalColumns).toBe(3)
    expect(lanes.get('c')?.totalColumns).toBe(3)
    // distinct columns within the group
    const cols = ['a', 'b', 'c'].map((id) => lanes.get(id)!.column).sort()
    expect(cols).toEqual([0, 1, 2])
  })

  it('lanes are assigned across item identity only (type-agnostic): an event and a task at the same time share a group', () => {
    const lanes = assignOverlapLanes([
      { id: 'task-1', startMinutes: 600, endMinutes: 660 },
      { id: 'event-x', startMinutes: 600, endMinutes: 660 },
    ])
    expect(lanes.get('task-1')?.totalColumns).toBe(2)
    expect(lanes.get('event-x')?.totalColumns).toBe(2)
  })
})
