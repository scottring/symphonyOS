import { describe, it, expect } from 'vitest'
import type { Task } from '@/types/task'
import { selectExpired } from './expired'

const NOW = new Date('2026-09-03T14:00:00-04:00')

function daysAgo(n: number): Date {
  const d = new Date(NOW)
  d.setDate(d.getDate() - n)
  d.setHours(0, 0, 0, 0)
  return d
}

const task = (over: Partial<Task> = {}): Task => ({
  id: 't', title: 'A thing', completed: false, bucket: 'timed',
  createdAt: NOW, updatedAt: NOW, scheduledFor: daysAgo(1),
  ...over,
} as Task)

describe('selectExpired', () => {
  it('takes every past-dated open task, whatever its age', () => {
    const rows = selectExpired([
      task({ id: 'yesterday', scheduledFor: daysAgo(1) }),
      task({ id: 'grace-edge', scheduledFor: daysAgo(2) }),
      task({ id: 'slipped', scheduledFor: daysAgo(25) }),
    ], NOW)
    // The whole point of the section: the grace window splits Today's lane
    // from Review's queue, but it must NOT split the list. Both halves are
    // invisible everywhere else.
    expect(rows.map((r) => r.task.id)).toEqual(['yesterday', 'grace-edge', 'slipped'])
    expect(rows.map((r) => r.ageDays)).toEqual([1, 2, 25])
  })

  it('sorts newest first, matching the Review drawer', () => {
    const rows = selectExpired([
      task({ id: 'old', scheduledFor: daysAgo(25) }),
      task({ id: 'new', scheduledFor: daysAgo(1) }),
      task({ id: 'mid', scheduledFor: daysAgo(7) }),
    ], NOW)
    expect(rows.map((r) => r.task.id)).toEqual(['new', 'mid', 'old'])
  })

  it('leaves today, the future, and the undated alone', () => {
    const rows = selectExpired([
      task({ id: 'today', scheduledFor: daysAgo(0) }),
      task({ id: 'tomorrow', scheduledFor: daysAgo(-1) }),
      task({ id: 'capture', bucket: 'inbox', scheduledFor: null }),
      task({ id: 'pool', bucket: 'week', scheduledFor: null }),
    ], NOW)
    expect(rows).toEqual([])
  })

  // A task dated 8pm yesterday is expired at 2pm today: the DAY is what
  // expired, not the hour. Comparing instants would hold it back a day.
  it('compares calendar days, not instants', () => {
    const lateYesterday = new Date(NOW)
    lateYesterday.setDate(lateYesterday.getDate() - 1)
    lateYesterday.setHours(20, 0, 0, 0)
    const rows = selectExpired([task({ id: 'christian', scheduledFor: lateYesterday })], NOW)
    expect(rows.map((r) => r.ageDays)).toEqual([1])
  })

  it('drops completed work — this is a list of what is still open', () => {
    expect(selectExpired([task({ id: 'done', completed: true })], NOW)).toEqual([])
  })

  it('never counts a subtask that only inherited its parent date', () => {
    const parentDate = daysAgo(3)
    const rows = selectExpired([
      task({
        id: 'parent', title: 'Brainstorm vacation', scheduledFor: parentDate,
        subtasks: [
          task({ id: 'copied', title: 'Step with parent timestamp', scheduledFor: parentDate }),
          task({ id: 'own-day', title: 'Step on its own day', scheduledFor: daysAgo(5) }),
        ],
      } as Partial<Task>),
    ], NOW)
    expect(rows.map((r) => r.task.id)).toEqual(['parent', 'own-day'])
  })
})
