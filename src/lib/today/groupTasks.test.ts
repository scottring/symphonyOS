import { describe, it, expect, vi } from 'vitest'
import { groupTasks } from './groupTasks'

describe('groupTasks', () => {
  const date = new Date('2026-06-06T00:00:00')

  it('creates a wrapper then reparents each child to it, returns wrapper id', async () => {
    const addTask = vi.fn().mockResolvedValue('wrapper-1')
    const updateTask = vi.fn().mockResolvedValue(undefined)

    const result = await groupTasks(
      { taskIds: ['a', 'b'], groupName: 'Sat AM errands', date, isAllDay: true,
        assignedTo: 'me', context: 'family' },
      { addTask, updateTask },
    )

    expect(result).toBe('wrapper-1')
    expect(addTask).toHaveBeenCalledTimes(1)
    expect(addTask).toHaveBeenCalledWith(
      'Sat AM errands', undefined, undefined, date,
      { isAllDay: true, assignedTo: 'me', context: 'family' },
    )
    expect(updateTask).toHaveBeenCalledTimes(2)
    expect(updateTask).toHaveBeenNthCalledWith(1, 'a',
      { parentTaskId: 'wrapper-1', scheduledFor: date, isAllDay: true })
    expect(updateTask).toHaveBeenNthCalledWith(2, 'b',
      { parentTaskId: 'wrapper-1', scheduledFor: date, isAllDay: true })
  })

  it('aborts (no reparenting) when wrapper creation fails', async () => {
    const addTask = vi.fn().mockResolvedValue(undefined)
    const updateTask = vi.fn().mockResolvedValue(undefined)

    const result = await groupTasks(
      { taskIds: ['a'], groupName: 'x', date, isAllDay: true },
      { addTask, updateTask },
    )

    expect(result).toBeUndefined()
    expect(updateTask).not.toHaveBeenCalled()
  })

  // Reparenting via updateTask leaves children flat in client state (the
  // optimistic path doesn't re-nest a task that's BECOMING a subtask), so the
  // group wouldn't render until a manual refresh. groupTasks rebuilds the
  // nested tree by calling the injected refetch after all reparents land.
  it('refetches once, after reparenting, to rebuild the nested tree', async () => {
    const addTask = vi.fn().mockResolvedValue('wrapper-1')
    const updateTask = vi.fn().mockResolvedValue(undefined)
    const refetch = vi.fn().mockResolvedValue(undefined)

    await groupTasks(
      { taskIds: ['a', 'b'], groupName: 'g', date, isAllDay: true },
      { addTask, updateTask, refetch },
    )

    expect(refetch).toHaveBeenCalledTimes(1)
    // refetch must run AFTER the last updateTask, not before/interleaved
    const lastUpdateOrder = Math.max(...updateTask.mock.invocationCallOrder)
    const refetchOrder = refetch.mock.invocationCallOrder[0]
    expect(refetchOrder).toBeGreaterThan(lastUpdateOrder)
  })

  it('does not refetch when wrapper creation fails', async () => {
    const addTask = vi.fn().mockResolvedValue(undefined)
    const updateTask = vi.fn().mockResolvedValue(undefined)
    const refetch = vi.fn().mockResolvedValue(undefined)

    await groupTasks(
      { taskIds: ['a'], groupName: 'x', date, isAllDay: true },
      { addTask, updateTask, refetch },
    )

    expect(refetch).not.toHaveBeenCalled()
  })
})
