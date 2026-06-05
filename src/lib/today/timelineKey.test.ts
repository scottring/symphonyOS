import { describe, it, expect } from 'vitest'
import { parseTimelineKey, timelineKey, partitionSelection } from './timelineKey'

describe('timelineKey', () => {
  it('round-trips a key', () => {
    expect(timelineKey({ type: 'task', id: 'abc' })).toBe('task-abc')
    expect(parseTimelineKey('task-abc')).toEqual({ type: 'task', id: 'abc' })
  })
  it('splits on the first hyphen only (ids may contain hyphens)', () => {
    expect(parseTimelineKey('event-a-b-c')).toEqual({ type: 'event', id: 'a-b-c' })
  })
  it('returns null for an unknown prefix', () => {
    expect(parseTimelineKey('note-1')).toBeNull()
  })
  it('partitions a mixed selection by type', () => {
    const set = new Set(['task-1', 'event-2', 'routine-3', 'task-4'])
    expect(partitionSelection(set)).toEqual({
      taskIds: ['1', '4'], eventIds: ['2'], routineIds: ['3'],
    })
  })
})
