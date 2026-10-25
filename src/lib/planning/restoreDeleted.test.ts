import { describe, it, expect, vi } from 'vitest'
import type { Task } from '@/types/task'
import { restoreDeleted, deleteQuestion } from './restoreDeleted'

const t = (x: Partial<Task>) => ({ id: 'x', title: 'X', completed: false, createdAt: new Date(), ...x }) as Task

describe('restoreDeleted', () => {
  it('puts the row back with its id, period and links, then its pieces under it', async () => {
    const addTask = vi.fn(async (_title: string, _c?: string, _p?: string, _at?: Date, o?: { id?: string }) => o?.id)
    const goal = t({ id: 'm', title: 'Find K therapist', bucket: 'month', monthStart: new Date(2026, 9, 1), sourceId: 's', goalId: 'g', context: 'family', notes: 'ask Dr. Mills',
      subtasks: [t({ id: 'p1', title: 'Fill out KK assessment', bucket: 'month', monthStart: new Date(2026, 9, 1), parentTaskId: 'm' })] })
    expect(await restoreDeleted(addTask as never, goal)).toBe(true)
    expect(addTask).toHaveBeenNthCalledWith(1, 'Find K therapist', undefined, undefined, undefined, expect.objectContaining({
      id: 'm', bucket: 'month', monthStart: new Date(2026, 9, 1), sourceId: 's', goalId: 'g', context: 'family', notes: 'ask Dr. Mills' }))
    expect(addTask).toHaveBeenNthCalledWith(2, 'Fill out KK assessment', undefined, undefined, undefined, expect.objectContaining({ id: 'p1', parentTaskId: 'm' }))
  })
  it('says no when the row could not be put back', async () => {
    expect(await restoreDeleted(vi.fn(async () => undefined) as never, t({}))).toBe(false)
  })
  it('asks once, naming the pieces that go with it', () => {
    expect(deleteQuestion(t({}))).toBe('Delete for good?')
    expect(deleteQuestion(t({ subtasks: [t({ id: 'a' }), t({ id: 'b' })] }))).toBe('Delete it and its 2 pieces?')
  })
})
