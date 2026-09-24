import { describe, it, expect } from 'vitest'
import { timingRemoval } from './planActions'
import type { Task } from '@/types/task'

const OCT1 = new Date(2026, 9, 1)
const OCT4 = new Date(2026, 9, 4)
const OCT6 = new Date(2026, 9, 6)

const task = (over: Partial<Task> = {}): Task => ({
  id: 't1', title: 'Buy game tickets', completed: false, bucket: 'timed',
  scheduledFor: OCT6, isAllDay: true, weekStart: OCT4, monthStart: OCT1,
  goalTaskId: 'g1', focus: [{ userId: 'u1', date: OCT6 }],
  createdAt: new Date(), updatedAt: new Date(), ...over,
} as Task)

describe('timingRemoval', () => {
  it('removing the day clears the date and that day\'s focus, and nothing else', () => {
    const { updates } = timingRemoval(task(), 'day', { monthStart: OCT1 })
    expect(updates.scheduledFor).toBeUndefined()
    expect(updates.isAllDay).toBeUndefined()
    expect(updates.focus).toEqual([])
    // The week and the period are not in the write at all, so they survive.
    expect('weekStart' in updates).toBe(false)
    expect('bucket' in updates).toBe(false)
    expect('monthStart' in updates).toBe(false)
  })

  it('never touches the goal link', () => {
    for (const scope of ['day', 'all'] as const) {
      expect('goalTaskId' in timingRemoval(task(), scope, { monthStart: OCT1 }).updates).toBe(false)
      expect('supportsGoalTaskId' in timingRemoval(task(), scope, { monthStart: OCT1 }).updates).toBe(false)
    }
  })

  it('removing both returns the task to the period it is TOLD, not the current one', () => {
    const { updates } = timingRemoval(task(), 'all', { monthStart: OCT1 })
    expect(updates.bucket).toBe('month')
    expect(updates.monthStart).toEqual(OCT1)
    expect(updates.weekStart).toBeUndefined()
    expect(updates.scheduledFor).toBeUndefined()
  })

  it('falls back to a season when that is the rung above', () => {
    const { updates } = timingRemoval(task({ monthStart: undefined, seasonStart: new Date(2026, 8, 22) }), 'all', { seasonStart: new Date(2026, 8, 22) })
    expect(updates.bucket).toBe('quarter')
    expect(updates.seasonStart).toEqual(new Date(2026, 8, 22))
  })

  // With no rung above, the write must not invent one: the caller is expected
  // to have said so before offering the gesture.
  it('names no period when it is given none', () => {
    const { updates } = timingRemoval(task(), 'all', {})
    expect('bucket' in updates).toBe(false)
    expect('monthStart' in updates).toBe(false)
    expect(updates.weekStart).toBeUndefined()
  })

  it('hands back everything the write touched, so one Undo restores the gesture', () => {
    const t = task()
    const day = timingRemoval(t, 'day', { monthStart: OCT1 })
    expect(day.previous).toEqual({ focus: t.focus, scheduledFor: OCT6, isAllDay: true })
    const all = timingRemoval(t, 'all', { monthStart: OCT1 })
    expect(all.previous).toEqual({
      focus: t.focus, scheduledFor: OCT6, isAllDay: true,
      bucket: 'timed', weekStart: OCT4, monthStart: OCT1, seasonStart: undefined,
    })
  })

  it('keeps other days\' focus when only one day is being removed', () => {
    const t = task({ focus: [{ userId: 'u1', date: OCT6 }, { userId: 'u1', date: new Date(2026, 9, 8) }] })
    const { updates } = timingRemoval(t, 'day', { monthStart: OCT1 })
    expect(updates.focus).toEqual([{ userId: 'u1', date: new Date(2026, 9, 8) }])
  })
})
