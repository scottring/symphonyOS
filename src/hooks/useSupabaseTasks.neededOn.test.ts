import { describe, it, expect } from 'vitest'
import { dbTaskToTask } from './useSupabaseTasks'

describe('needed_on mapping', () => {
  it('hydrates needed_on into a Date', () => {
    const task = dbTaskToTask({ id: 't1', title: 'x', completed: false, needed_on: '2026-08-19' } as never)
    expect(task.neededOn?.getFullYear()).toBe(2026)
    expect(task.neededOn?.getMonth()).toBe(7)
    expect(task.neededOn?.getDate()).toBe(19)
  })

  it('leaves neededOn undefined when the column is null', () => {
    const task = dbTaskToTask({ id: 't1', title: 'x', completed: false, needed_on: null } as never)
    expect(task.neededOn).toBeUndefined()
  })
})


it('hydrates a flexible weekend as a local date without scheduling a day', () => {
  const task = dbTaskToTask({ id: 'weekend', title: 'x', completed: false, weekend_start: '2026-09-26' } as never)
  expect(task.weekendStart).toEqual(new Date(2026, 8, 26))
  expect(task.scheduledFor).toBeUndefined()
})

// Let go ("not ever", 2026-11-04) is kept as dismissed_at: read back so the
// lists can leave it out and search can say when.
it('hydrates dismissed_at into a Date, and leaves it undefined when null', () => {
  expect(dbTaskToTask({ id: 'g', title: 'x', completed: false, dismissed_at: '2026-11-04T14:00:00.000Z' } as never).dismissedAt)
    .toEqual(new Date('2026-11-04T14:00:00.000Z'))
  expect(dbTaskToTask({ id: 'g', title: 'x', completed: false, dismissed_at: null } as never).dismissedAt).toBeUndefined()
})
