import { describe, it, expect } from 'vitest'
import { findTaskById } from './findTaskById'
import type { Task } from '@/types/task'

function task(over: Partial<Task>): Task {
  return { id: 't', title: 'Task', completed: false, ...over } as Task
}

const tasks: Task[] = [
  task({ id: 'p1', title: 'Picture Day', subtasks: [
    task({ id: 's1', title: 'Collared shirt', completed: true }),
    task({ id: 's2', title: 'Order form' }),
  ] }),
  task({ id: 'p2', title: 'Errand' }),
]

describe('findTaskById', () => {
  it('finds a top-level task', () => {
    expect(findTaskById(tasks, 'p2')?.title).toBe('Errand')
  })

  // The whole point: a flat `tasks.find(...)` returns undefined here, and every
  // caller that reads `completed` off the result then reads it off nothing.
  it('finds a task nested as a subtask', () => {
    expect(findTaskById(tasks, 's1')?.title).toBe('Collared shirt')
    expect(findTaskById(tasks, 's1')?.completed).toBe(true)
  })

  it('returns undefined for an unknown id', () => {
    expect(findTaskById(tasks, 'nope')).toBeUndefined()
  })

  it('copes with a task that has no subtasks array', () => {
    expect(findTaskById([task({ id: 'a' })], 'b')).toBeUndefined()
  })
})
