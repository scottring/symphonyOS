import { describe, it, expect, vi } from 'vitest'
import { groupTasks, removeFromGroup, ungroupTasks, deleteTaskGroup, groupItems, addToGroup } from './groupTasks'
import type { GroupMemberRef } from '@/types/task'

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

describe('groupItems', () => {
  it('creates a wrapper, reparents tasks, and writes event/routine refs', async () => {
    const calls: any[] = []
    const deps = {
      addTask: async () => 'wrapper-1',
      updateTask: async (id: string, updates: any) => { calls.push({ id, updates }) },
      refetch: async () => {},
    }
    const memberRefs: GroupMemberRef[] = [
      { type: 'event', id: 'e1' }, { type: 'routine', id: 'r1' },
    ]
    const date = new Date('2026-06-05T00:00:00Z')
    const wrapperId = await groupItems(
      { taskIds: ['t1'], memberRefs, groupName: 'Morning', date, isAllDay: true },
      deps,
    )
    expect(wrapperId).toBe('wrapper-1')
    expect(calls).toContainEqual({ id: 't1', updates: { parentTaskId: 'wrapper-1', scheduledFor: date, isAllDay: true } })
    expect(calls).toContainEqual({ id: 'wrapper-1', updates: { groupMembers: memberRefs } })
  })

  it('returns undefined and touches nothing if wrapper creation fails', async () => {
    const calls: any[] = []
    const deps = {
      addTask: async () => undefined,
      updateTask: async (id: string, u: any) => { calls.push({ id, u }) },
      refetch: async () => {},
    }
    const wrapperId = await groupItems(
      { taskIds: ['t1'], memberRefs: [], groupName: 'x', date: new Date(), isAllDay: true },
      deps,
    )
    expect(wrapperId).toBeUndefined()
    expect(calls).toHaveLength(0)
  })
})

describe('addToGroup', () => {
  const deps = () => {
    const updateTask = vi.fn()
    const refetch = vi.fn()
    return { addTask: vi.fn(), updateTask, refetch }
  }

  it('reparents each task onto the wrapper, inheriting its date and all-day', async () => {
    const d = deps()
    await addToGroup({
      wrapperId: 'w1', taskIds: ['t1', 't2'], memberRefs: [], existingMemberRefs: [],
      date: new Date(2026, 6, 25), isAllDay: true,
    }, d)
    expect(d.updateTask).toHaveBeenCalledWith('t1',
      expect.objectContaining({ parentTaskId: 'w1', isAllDay: true }))
    expect(d.updateTask).toHaveBeenCalledWith('t2',
      expect.objectContaining({ parentTaskId: 'w1', isAllDay: true }))
  })

  it('APPENDS new refs to the wrapper rather than replacing them', async () => {
    const d = deps()
    const existing = [{ type: 'event' as const, id: 'e1' }]
    await addToGroup({
      wrapperId: 'w1', taskIds: [], memberRefs: [{ type: 'routine', id: 'r1' }],
      existingMemberRefs: existing, date: new Date(2026, 6, 25), isAllDay: true,
    }, d)
    expect(d.updateTask).toHaveBeenCalledWith('w1', {
      groupMembers: [{ type: 'event', id: 'e1' }, { type: 'routine', id: 'r1' }],
    })
  })

  it('does not re-add a ref the group already has', async () => {
    const d = deps()
    const existing = [{ type: 'event' as const, id: 'e1' }]
    await addToGroup({
      wrapperId: 'w1', taskIds: [], memberRefs: [{ type: 'event', id: 'e1' }],
      existingMemberRefs: existing, date: new Date(2026, 6, 25), isAllDay: true,
    }, d)
    // When all incoming refs are already present, the entire addition is a no-op:
    // no updateTask to the wrapper, and no refetch.
    expect(d.updateTask).not.toHaveBeenCalledWith('w1', expect.anything())
    expect(d.refetch).not.toHaveBeenCalled()
  })

  it('refetches once, after all writes', async () => {
    const d = deps()
    await addToGroup({
      wrapperId: 'w1', taskIds: ['t1'], memberRefs: [], existingMemberRefs: [],
      date: new Date(2026, 6, 25), isAllDay: true,
    }, d)
    expect(d.refetch).toHaveBeenCalledTimes(1)
    // Verify refetch happens AFTER the last updateTask, not before/interleaved
    const lastUpdateOrder = Math.max(...d.updateTask.mock.invocationCallOrder)
    const refetchOrder = d.refetch.mock.invocationCallOrder[0]
    expect(refetchOrder).toBeGreaterThan(lastUpdateOrder)
  })

  it('does nothing when there is nothing to add', async () => {
    const d = deps()
    await addToGroup({
      wrapperId: 'w1', taskIds: [], memberRefs: [], existingMemberRefs: [],
      date: new Date(2026, 6, 25), isAllDay: true,
    }, d)
    expect(d.updateTask).not.toHaveBeenCalled()
    expect(d.refetch).not.toHaveBeenCalled()
  })

  it('is a no-op when memberRefs are entirely duplicates (with no tasks)', async () => {
    const d = deps()
    const existing = [
      { type: 'event' as const, id: 'e1' },
      { type: 'routine' as const, id: 'r1' },
    ]
    await addToGroup({
      wrapperId: 'w1',
      taskIds: [],
      memberRefs: existing, // Same refs already in the group
      existingMemberRefs: existing,
      date: new Date(2026, 6, 25),
      isAllDay: true,
    }, d)
    // No tasks to reparent, and no new refs to add (all duplicates),
    // so no writes and no refetch.
    expect(d.updateTask).not.toHaveBeenCalled()
    expect(d.refetch).not.toHaveBeenCalled()
  })
})
