import { describe, it, expect } from 'vitest'
import type { Task } from '@/types/task'
import { selectWaiting, waitingUpdates } from './waiting'

const now = new Date(2026, 9, 1, 15) // Thu Oct 1 2026
const task = (over: Partial<Task>): Task => ({
  id: over.id ?? 't', title: 'x', completed: false, createdAt: new Date(2026, 8, 1), ...over,
} as Task)

describe('selectWaiting', () => {
  it('lists open waits only — not done ones, not plain tasks, not subtasks', () => {
    const rows = selectWaiting([
      task({ id: 'a', isWaiting: true }),
      task({ id: 'b', isWaiting: true, completed: true }),
      task({ id: 'c' }),
      task({ id: 'd', isWaiting: true, parentTaskId: 'a' }),
    ], now)
    expect(rows.map((r) => r.task.id)).toEqual(['a'])
  })

  it('puts due follow-ups first, then by check-back day, then undated', () => {
    const rows = selectWaiting([
      task({ id: 'undated', isWaiting: true }),
      task({ id: 'monday', isWaiting: true, scheduledFor: new Date(2026, 9, 5) }),
      task({ id: 'missed', isWaiting: true, scheduledFor: new Date(2026, 8, 28) }),
      task({ id: 'today', isWaiting: true, scheduledFor: new Date(2026, 9, 1, 0) }),
    ], now)
    expect(rows.map((r) => [r.task.id, r.due])).toEqual([
      ['missed', true], ['today', true], ['monday', false], ['undated', false],
    ])
  })
})

describe('waitingUpdates', () => {
  it('starts the clock on a new wait and moves the task to the check-back day, all-day', () => {
    const u = waitingUpdates({ isWaiting: false }, 'Goodman to call back', new Date(2026, 9, 5, 14))
    expect(u.isWaiting).toBe(true)
    expect(u.waitingFor).toBe('Goodman to call back')
    expect(u.waitingSince).toBeInstanceOf(Date)
    expect(u).toMatchObject({ bucket: 'timed', isAllDay: true, scheduledFor: new Date(2026, 9, 5) })
  })

  it('editing a wait keeps its clock and, without a day, its date', () => {
    const u = waitingUpdates({ isWaiting: true }, 'Barr')
    expect('waitingSince' in u).toBe(false)
    expect('scheduledFor' in u).toBe(false)
  })
})
