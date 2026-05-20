import { describe, it, expect } from 'vitest'
import type { Task } from '@/types/task'
import { discussionItems } from './discussionItems'

function mkTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `task-${id}`,
    completed: false,
    scheduledFor: null,
    context: null,
    projectId: null,
    contactId: null,
    assignedTo: null,
    bucket: 'today',
    createdAt: new Date(2026, 0, 1),
    updatedAt: new Date(2026, 0, 1),
    ...overrides,
  } as Task
}

describe('discussionItems', () => {
  it('returns empty when no tasks are flagged', () => {
    const tasks = [mkTask('a'), mkTask('b', { needsDiscussion: false })]
    expect(discussionItems(tasks)).toEqual([])
  })

  it('includes tasks flagged needsDiscussion', () => {
    const tasks = [
      mkTask('a'),
      mkTask('b', { needsDiscussion: true, title: 'Finances with Iris' }),
    ]
    const result = discussionItems(tasks)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('b')
    expect(result[0].title).toBe('Finances with Iris')
  })

  it('excludes completed tasks (the discussion presumably happened)', () => {
    const tasks = [
      mkTask('a', { needsDiscussion: true, completed: true }),
      mkTask('b', { needsDiscussion: true, completed: false }),
    ]
    const result = discussionItems(tasks)
    expect(result.map((t) => t.id)).toEqual(['b'])
  })

  it('exposes the discussion note when present', () => {
    const tasks = [
      mkTask('a', { needsDiscussion: true, discussionNote: 'Pick a date for the trip' }),
    ]
    expect(discussionItems(tasks)[0].note).toBe('Pick a date for the trip')
  })

  it('sorts by recency (most recently updated first)', () => {
    const tasks = [
      mkTask('a', { needsDiscussion: true, updatedAt: new Date(2026, 0, 1) }),
      mkTask('b', { needsDiscussion: true, updatedAt: new Date(2026, 5, 1) }),
      mkTask('c', { needsDiscussion: true, updatedAt: new Date(2026, 3, 1) }),
    ]
    const result = discussionItems(tasks)
    expect(result.map((t) => t.id)).toEqual(['b', 'c', 'a'])
  })

  it('caps results at the requested limit', () => {
    const tasks = Array.from({ length: 10 }, (_, i) =>
      mkTask(`t${i}`, { needsDiscussion: true }),
    )
    expect(discussionItems(tasks, 4)).toHaveLength(4)
  })
})
