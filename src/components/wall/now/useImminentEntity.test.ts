import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useImminentEntity } from './useImminentEntity'
import { createMockTask } from '@/test/mocks/factories'

describe('useImminentEntity', () => {
  it('returns the next event within the window', () => {
    const now = new Date('2026-05-08T15:00:00Z')
    const soonEvent = { id: 'e1', title: 'Pickup', start_time: '2026-05-08T15:15:00Z' } as any
    const laterEvent = { id: 'e2', title: 'Dinner', start_time: '2026-05-08T18:00:00Z' } as any
    const { result } = renderHook(() => useImminentEntity({
      events: [soonEvent, laterEvent],
      tasks: [],
      now,
      windowMinutes: 30,
    }))
    expect(result.current?.kind).toBe('event')
    expect((result.current?.entity as { id: string })?.id).toBe('e1')
  })

  it('returns the next scheduled task within the window if nothing else closer', () => {
    const now = new Date('2026-05-08T15:00:00Z')
    const task = createMockTask({
      id: 't1',
      title: 'Take out trash',
      scheduledFor: new Date('2026-05-08T15:10:00Z'),
    })
    const { result } = renderHook(() => useImminentEntity({
      events: [],
      tasks: [task],
      now,
      windowMinutes: 30,
    }))
    expect(result.current?.kind).toBe('task')
  })

  it('prefers the closer of an event and a task', () => {
    const now = new Date('2026-05-08T15:00:00Z')
    const task = createMockTask({
      id: 't1',
      scheduledFor: new Date('2026-05-08T15:05:00Z'),
    })
    const event = { id: 'e1', start_time: '2026-05-08T15:20:00Z' } as any
    const { result } = renderHook(() => useImminentEntity({
      events: [event],
      tasks: [task],
      now,
      windowMinutes: 30,
    }))
    expect(result.current?.kind).toBe('task')
  })

  it('returns null when nothing falls within the window', () => {
    const now = new Date('2026-05-08T15:00:00Z')
    const farEvent = { id: 'e1', start_time: '2026-05-08T22:00:00Z' } as any
    const { result } = renderHook(() => useImminentEntity({
      events: [farEvent],
      tasks: [],
      now,
      windowMinutes: 30,
    }))
    expect(result.current).toBeNull()
  })

  it('skips past entities (start time before now)', () => {
    const now = new Date('2026-05-08T15:00:00Z')
    const past = { id: 'e1', start_time: '2026-05-08T14:00:00Z' } as any
    const { result } = renderHook(() => useImminentEntity({
      events: [past],
      tasks: [],
      now,
      windowMinutes: 30,
    }))
    expect(result.current).toBeNull()
  })
})
