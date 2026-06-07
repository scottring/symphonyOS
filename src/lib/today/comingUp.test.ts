import { describe, it, expect } from 'vitest'
import { selectComingUp } from './comingUp'
import type { Task } from '@/types/task'

function task(over: Partial<Task>): Task {
  return {
    id: Math.random().toString(36).slice(2),
    title: 't',
    completed: false,
    bucket: 'inbox',
    scheduledFor: undefined,
    isAllDay: true,
    context: null,
    assignedTo: null,
    assignedToAll: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...(over as Task),
  }
}

describe('selectComingUp', () => {
  const now = new Date(2026, 5, 7, 10, 0, 0) // Sun Jun 7

  it('counts week-pool and inbox items', () => {
    const tasks = [
      task({ bucket: 'week' }),
      task({ bucket: 'week' }),
      task({ bucket: 'inbox' }),
      task({ bucket: 'month' }), // ignored
    ]
    const s = selectComingUp(tasks, now)
    expect(s.weekCount).toBe(2)
    expect(s.inboxCount).toBe(1)
  })

  it('groups dated items by upcoming day, excluding today and overdue', () => {
    const tomorrow = new Date(2026, 5, 8, 9, 0, 0)
    const tomorrow2 = new Date(2026, 5, 8, 14, 0, 0)
    const dayAfter = new Date(2026, 5, 9, 9, 0, 0)
    const today = new Date(2026, 5, 7, 16, 0, 0)
    const yesterday = new Date(2026, 5, 6, 9, 0, 0)
    const tasks = [
      task({ bucket: 'timed', scheduledFor: tomorrow }),
      task({ bucket: 'timed', scheduledFor: tomorrow2 }),
      task({ bucket: 'timed', scheduledFor: dayAfter }),
      task({ bucket: 'timed', scheduledFor: today }),     // excluded (today)
      task({ bucket: 'timed', scheduledFor: yesterday }), // excluded (overdue)
    ]
    const s = selectComingUp(tasks, now)
    expect(s.nextDays).toHaveLength(2)
    expect(s.nextDays[0].date.getDate()).toBe(8)
    expect(s.nextDays[0].count).toBe(2)
    expect(s.nextDays[1].date.getDate()).toBe(9)
    expect(s.nextDays[1].count).toBe(1)
  })

  it('respects the horizon window', () => {
    const far = new Date(2026, 5, 20, 9, 0, 0) // ~13 days out
    const s = selectComingUp([task({ bucket: 'timed', scheduledFor: far })], now, 7)
    expect(s.nextDays).toHaveLength(0)
  })

  it('ignores completed items', () => {
    const tomorrow = new Date(2026, 5, 8, 9, 0, 0)
    const s = selectComingUp([
      task({ bucket: 'week', completed: true }),
      task({ bucket: 'timed', scheduledFor: tomorrow, completed: true }),
    ], now)
    expect(s.weekCount).toBe(0)
    expect(s.nextDays).toHaveLength(0)
  })
})
