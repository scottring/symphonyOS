import { describe, it, expect } from 'vitest'
import type { Task } from '@/types/task'
import { isLetGo, letGoNote, letGoUpdates, unletGoUpdates } from './letGo'

// Let go means not ever (Scott, 2026-11-04).
const FALL = new Date(2026, 8, 1), NOV = new Date(2026, 10, 1)
const task = (over: Partial<Task> = {}): Task => ({ id: 't', title: 'Plan winter vacation', completed: false, createdAt: NOV, updatedAt: NOV, ...over }) as Task

describe('letGo', () => {
  it('lets go: to Someday, marked when', () => {
    const at = new Date(2026, 10, 4, 9)
    expect(letGoUpdates(at)).toEqual({ bucket: 'someday', dismissedAt: at })
    expect(isLetGo(task({ dismissedAt: at }))).toBe(true)
    expect(isLetGo(task())).toBe(false)
  })

  it('Undo states the periods and the place it had, and clears the mark', () => {
    const t = task({ bucket: 'month', monthStart: NOV, seasonStart: FALL, commitments: [
      { level: 'season', periodStart: FALL, status: 'open' }, { level: 'month', periodStart: NOV, status: 'open' },
    ] })
    expect(unletGoUpdates(t)).toMatchObject({
      bucket: 'month', monthStart: NOV, seasonStart: FALL, scheduledFor: null, dismissedAt: undefined,
      commitments: [{ level: 'season', periodStart: FALL, status: 'open' }, { level: 'month', periodStart: NOV, status: 'open' }],
    })
    expect('dismissedAt' in unletGoUpdates(t)).toBe(true)
  })

  it('search’s note: "Let go Nov 4"; nothing for a school paper or an item still on its lists', () => {
    expect(letGoNote(task({ dismissedAt: new Date(2026, 10, 4, 9) }))).toBe('Let go Nov 4')
    expect(letGoNote(task({ dismissedAt: new Date(2026, 10, 4, 9), category: 'paper' }))).toBeNull()
    expect(letGoNote(task())).toBeNull()
  })
})
