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
})
