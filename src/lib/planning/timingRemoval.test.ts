import { describe, it, expect } from 'vitest'
import { timingRemoval } from './planActions'
import { weekendPlacement } from './weekend'
import { planPlacement } from '@/lib/placement/intentions'
import { deriveCache, openCommitment, liveCommitments } from '@/lib/placement/model'
import type { Task, TaskCommitment } from '@/types/task'

const SEP22 = new Date(2026, 8, 22)
const OCT1 = new Date(2026, 9, 1)
const OCT4 = new Date(2026, 9, 4)
const OCT6 = new Date(2026, 9, 6)
const OCT11 = new Date(2026, 9, 11)

const ctx = { now: new Date(2026, 8, 24), userId: 'u1' }

/** A LEGACY row: cached stamps, no commitment records loaded. */
const task = (over: Partial<Task> = {}): Task => ({
  id: 't1', title: 'Buy game tickets', completed: false, bucket: 'timed',
  scheduledFor: OCT6, isAllDay: true, weekStart: OCT4, monthStart: OCT1,
  goalTaskId: 'g1', focus: [{ userId: 'u1', date: OCT6 }],
  createdAt: new Date(), updatedAt: new Date(), ...over,
} as Task)

/** A row with real commitment records, cache derived from them. */
const recorded = (commitments: TaskCommitment[], over: Partial<Task> = {}): Task => {
  const base = task({ ...over, commitments, weekStart: undefined, monthStart: undefined })
  return { ...base, ...deriveCache(base) }
}

/** What the write actually leaves on the row — the DB's answer, not the patch. */
const applied = (t: Task, patch: Partial<Task>): Task => planPlacement(t, patch, ctx).local

describe('timingRemoval', () => {
  it('removing the day clears the date and that day\'s focus, and nothing else', () => {
    const { updates } = timingRemoval(task(), 'day')
    expect(updates.scheduledFor).toBeUndefined()
    expect(updates.isAllDay).toBeUndefined()
    expect(updates.focus).toEqual([])
    // The commitments are not in the write at all, so every one of them survives.
    expect('commitments' in updates).toBe(false)
    expect('weekStart' in updates).toBe(false)
    expect('bucket' in updates).toBe(false)
  })

  it('removing the day leaves the week and the month standing', () => {
    const after = applied(task(), timingRemoval(task(), 'day').updates)
    expect(after.scheduledFor).toBeUndefined()
    expect(openCommitment(after, 'week')?.periodStart).toEqual(OCT4)
    expect(openCommitment(after, 'month')?.periodStart).toEqual(OCT1)
    expect(after.bucket).toBe('week')
  })

  it('never touches the goal link', () => {
    for (const scope of ['day', 'all'] as const) {
      expect('goalTaskId' in timingRemoval(task(), scope).updates).toBe(false)
      expect('supportsGoalTaskId' in timingRemoval(task(), scope).updates).toBe(false)
    }
  })

  // The blocker Codex reproduced: the old write named a bucket and dropped a
  // stamp, and the week it meant to release stayed open behind it.
  it('removing both actually releases the week and keeps the month', () => {
    const t = task()
    const after = applied(t, timingRemoval(t, 'all').updates)
    expect(after.scheduledFor).toBeUndefined()
    expect(openCommitment(after, 'week')).toBeUndefined()
    expect(openCommitment(after, 'month')?.periodStart).toEqual(OCT1)
    expect(after.bucket).toBe('month')
  })

  it('falls back to a season when that is the rung above', () => {
    const t = task({ monthStart: undefined, seasonStart: SEP22 })
    const after = applied(t, timingRemoval(t, 'all').updates)
    expect(openCommitment(after, 'week')).toBeUndefined()
    expect(openCommitment(after, 'season')?.periodStart).toEqual(SEP22)
    expect(after.bucket).toBe('quarter')
  })

  // With no rung above, the write must not invent one — and must still let go
  // of the week rather than leaving it open with nothing said about it.
  it('with nothing above it, releases the week and names no period', () => {
    const t = task({ monthStart: undefined })
    const after = applied(t, timingRemoval(t, 'all').updates)
    expect(openCommitment(after, 'week')).toBeUndefined()
    expect(openCommitment(after, 'month')).toBeUndefined()
    expect(openCommitment(after, 'season')).toBeUndefined()
    expect(after.bucket).toBe('inbox')
  })

  it('one Undo puts back the day, the week and the month together', () => {
    const t = task()
    const { updates, previous } = timingRemoval(t, 'all')
    const after = applied(t, updates)
    const undone = applied(after, previous)
    expect(undone.scheduledFor).toEqual(OCT6)
    expect(undone.isAllDay).toBe(true)
    expect(openCommitment(undone, 'week')?.periodStart).toEqual(OCT4)
    expect(openCommitment(undone, 'month')?.periodStart).toEqual(OCT1)
    expect(undone.focus).toEqual(t.focus)
  })

  // A dated row's cached weekStart is the week its DATE falls in, which is not
  // the week it was committed to. Restoring the cache would move the task.
  it('Undo restores the week that was CHOSEN, not the week the date fell in', () => {
    const t = recorded([
      { level: 'week', periodStart: OCT11, status: 'open' },
      { level: 'month', periodStart: OCT1, status: 'open' },
    ])
    expect(t.weekStart).toEqual(OCT4) // the cache, from the Oct 6 date
    const { updates, previous } = timingRemoval(t, 'all')
    const after = applied(t, updates)
    expect(openCommitment(after, 'week')).toBeUndefined()
    const undone = applied(after, previous)
    expect(openCommitment(undone, 'week')?.periodStart).toEqual(OCT11)
    expect(openCommitment(undone, 'month')?.periodStart).toEqual(OCT1)
  })

  it('leaves the row\'s history — a done or carried commitment — alone', () => {
    const t = recorded([
      { level: 'week', periodStart: OCT4, status: 'open' },
      { level: 'week', periodStart: new Date(2026, 8, 27), status: 'carried', carriedTo: OCT4 },
      { level: 'month', periodStart: new Date(2026, 8, 1), status: 'done' },
      { level: 'month', periodStart: OCT1, status: 'open' },
    ])
    const after = applied(t, timingRemoval(t, 'all').updates)
    const live = liveCommitments(after)
    expect(live.find((c) => c.status === 'carried')?.carriedTo).toEqual(OCT4)
    expect(live.find((c) => c.status === 'done')?.periodStart).toEqual(new Date(2026, 8, 1))
    expect(openCommitment(after, 'week')).toBeUndefined()
  })

  it('keeps other days\' focus when only one day is being removed', () => {
    const t = task({ focus: [{ userId: 'u1', date: OCT6 }, { userId: 'u1', date: new Date(2026, 9, 8) }] })
    const { updates } = timingRemoval(t, 'day')
    expect(updates.focus).toEqual([{ userId: 'u1', date: new Date(2026, 9, 8) }])
  })
})

describe('a flexible weekend chosen from the Month page', () => {
  // A month row, as the Month page holds it: October, nothing below.
  const monthRow = () => recorded([{ level: 'month', periodStart: OCT1, status: 'open' }], { scheduledFor: undefined, isAllDay: undefined, focus: [] })
  const SAT10 = new Date(2026, 9, 10), SUN11 = new Date(2026, 9, 11)
  const onWeekend = () => applied(monthRow(), weekendPlacement(SAT10))

  it('adds the weekend and its week, and keeps the month', () => {
    const t = onWeekend()
    expect(t.weekendStart).toEqual(SAT10)
    expect(t.scheduledFor).toBeUndefined()
    expect(openCommitment(t, 'week')).toBeTruthy()
    expect(openCommitment(t, 'month')?.periodStart).toEqual(OCT1)
    expect(t.goalTaskId).toBe('g1')
  })

  it('one of its days keeps the weekend; removing that day returns to "either day"', () => {
    const withDay = applied(onWeekend(), { bucket: 'timed', scheduledFor: SUN11, isAllDay: true })
    expect(withDay.weekendStart).toEqual(SAT10)
    const back = applied(withDay, timingRemoval(withDay, 'day').updates)
    expect(back.scheduledFor).toBeUndefined()
    expect(back.weekendStart).toEqual(SAT10)
    expect(openCommitment(back, 'week')).toBeTruthy()
    expect(openCommitment(back, 'month')?.periodStart).toEqual(OCT1)
  })

  it('"Remove weekend" clears the weekend with its week, keeps the month, and Undo puts it back', () => {
    const t = onWeekend()
    const { updates, previous } = timingRemoval(t, 'all')
    const after = applied(t, updates)
    expect(after.weekendStart).toBeUndefined()
    expect(openCommitment(after, 'week')).toBeUndefined()
    expect(openCommitment(after, 'month')?.periodStart).toEqual(OCT1)
    expect(applied(after, previous).weekendStart).toEqual(SAT10)
  })
})

describe('a season row taken into the month BEFORE its season', () => {
  it('keeps the season commitment, adds the month, and moves nothing else', () => {
    const OCT = new Date(2026, 9, 1), SEP = new Date(2026, 8, 1)
    const row = recorded([{ level: 'season', periodStart: OCT, status: 'open' }],
      { scheduledFor: undefined, isAllDay: undefined, focus: [], bucket: 'quarter', seasonStart: OCT, goalTaskId: undefined, assignedToAll: ['m1'] })
    const after = applied(row, { bucket: 'month', monthStart: SEP })
    expect(openCommitment(after, 'season')?.periodStart).toEqual(OCT)
    expect(openCommitment(after, 'month')?.periodStart).toEqual(SEP)
    expect(after.id).toBe(row.id)
    expect(after.assignedToAll).toEqual(['m1'])
  })
})
