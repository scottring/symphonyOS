import { describe, it, expect } from 'vitest'
import { dbTaskToTask } from './useSupabaseTasks'

type DbTaskArg = Parameters<typeof dbTaskToTask>[0]

// Minimal DB row — dbTaskToTask reads every field defensively (?? undefined),
// so unspecified columns map to undefined. We only care about the assignee here.
function row(overrides: Partial<DbTaskArg>): DbTaskArg {
  return {
    id: 't1',
    title: 'Test',
    completed: false,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  } as unknown as DbTaskArg
}

describe('dbTaskToTask — assignee normalization', () => {
  it('fills assignedToAll from a legacy single assigned_to when the array is null', () => {
    const task = dbTaskToTask(row({ assigned_to: 'member-1', assigned_to_all: null }))
    expect(task.assignedTo).toBe('member-1')
    expect(task.assignedToAll).toEqual(['member-1'])
  })

  it('keeps a populated assigned_to_all array as-is', () => {
    const task = dbTaskToTask(row({ assigned_to: 'member-1', assigned_to_all: ['member-1', 'member-2'] }))
    expect(task.assignedToAll).toEqual(['member-1', 'member-2'])
  })

  it('falls back to assigned_to when assigned_to_all is an empty array', () => {
    const task = dbTaskToTask(row({ assigned_to: 'member-1', assigned_to_all: [] }))
    expect(task.assignedToAll).toEqual(['member-1'])
  })

  it('leaves assignedToAll undefined when there is no assignee at all', () => {
    const task = dbTaskToTask(row({ assigned_to: null, assigned_to_all: null }))
    expect(task.assignedToAll).toBeUndefined()
  })
})
