import { describe, it, expect, vi } from 'vitest'
import { groupTasks, removeFromGroup, ungroupTasks, deleteTaskGroup } from './groupTasks'

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

describe('removeFromGroup', () => {
  it('clears the task’s parent then refetches', async () => {
    const updateTask = vi.fn().mockResolvedValue(undefined)
    const refetch = vi.fn().mockResolvedValue(undefined)

    await removeFromGroup('child-1', { updateTask, refetch })

    expect(updateTask).toHaveBeenCalledTimes(1)
    expect(updateTask).toHaveBeenCalledWith('child-1', { parentTaskId: undefined })
    expect(refetch).toHaveBeenCalledTimes(1)
    expect(refetch.mock.invocationCallOrder[0]).toBeGreaterThan(updateTask.mock.invocationCallOrder[0])
  })
})

describe('ungroupTasks', () => {
  it('clears every child’s parent, then deletes the wrapper, then refetches', async () => {
    const updateTask = vi.fn().mockResolvedValue(undefined)
    const deleteTask = vi.fn().mockResolvedValue(undefined)
    const refetch = vi.fn().mockResolvedValue(undefined)

    await ungroupTasks('wrap-1', ['a', 'b'], { updateTask, deleteTask, refetch })

    expect(updateTask).toHaveBeenNthCalledWith(1, 'a', { parentTaskId: undefined })
    expect(updateTask).toHaveBeenNthCalledWith(2, 'b', { parentTaskId: undefined })
    expect(deleteTask).toHaveBeenCalledTimes(1)
    expect(deleteTask).toHaveBeenCalledWith('wrap-1')
    // wrapper deletion happens AFTER children are detached (so they aren't orphaned)
    expect(deleteTask.mock.invocationCallOrder[0]).toBeGreaterThan(
      Math.max(...updateTask.mock.invocationCallOrder),
    )
    expect(refetch.mock.invocationCallOrder[0]).toBeGreaterThan(deleteTask.mock.invocationCallOrder[0])
  })
})

describe('deleteTaskGroup', () => {
  it('deletes every child and the wrapper, then refetches', async () => {
    const deleteTask = vi.fn().mockResolvedValue(undefined)
    const refetch = vi.fn().mockResolvedValue(undefined)

    await deleteTaskGroup('wrap-1', ['a', 'b'], { deleteTask, refetch })

    expect(deleteTask).toHaveBeenCalledTimes(3)
    expect(deleteTask).toHaveBeenNthCalledWith(1, 'a')
    expect(deleteTask).toHaveBeenNthCalledWith(2, 'b')
    expect(deleteTask).toHaveBeenNthCalledWith(3, 'wrap-1')
    expect(refetch.mock.invocationCallOrder[0]).toBeGreaterThan(Math.max(...deleteTask.mock.invocationCallOrder))
  })
})
