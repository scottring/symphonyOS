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
