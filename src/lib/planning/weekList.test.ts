import { describe, it, expect } from 'vitest'
import { createMockTask } from '@/test/mocks/factories'
import { weekListTasks, weekRowNote, weekRowNoteText } from './weekList'

const WEEK = new Date(2026, 9, 4)   // Sunday Oct 4, 2026
const LAST = new Date(2026, 8, 27)  // Sunday Sep 27
const c = (level: 'week' | 'month', periodStart: Date, status: 'open' | 'done' | 'carried' | 'removed' = 'open', carriedTo?: Date) =>
  ({ level, periodStart, status, carriedTo })

describe('weekListTasks', () => {
  it('is every task committed to the week, done rows included, goals excluded, in creation order', () => {
    const a = createMockTask({ id: 'a', title: 'A', bucket: 'week', weekStart: WEEK, createdAt: new Date(2026, 9, 1), commitments: [c('week', WEEK)] })
    const done = createMockTask({ id: 'd', title: 'D', bucket: 'week', weekStart: WEEK, completed: true, createdAt: new Date(2026, 8, 30), commitments: [c('week', WEEK, 'done')] })
    const goal = createMockTask({ id: 'g', title: 'G', isGoal: true, bucket: 'week', weekStart: WEEK, commitments: [c('week', WEEK)] })
    const other = createMockTask({ id: 'o', title: 'O', bucket: 'week', weekStart: LAST, commitments: [c('week', LAST)] })
    expect(weekListTasks([a, done, goal, other], WEEK, null).map((t) => t.id)).toEqual(['d', 'a'])
  })

  it('keeps a row that was picked for today (dated + focused) and a row given a day', () => {
    const picked = createMockTask({ id: 'p', bucket: 'timed', scheduledFor: new Date(2026, 9, 6), isAllDay: true,
      focus: [{ userId: 'me', date: new Date(2026, 9, 6) }], commitments: [c('week', WEEK)] })
    const dated = createMockTask({ id: 'x', bucket: 'timed', scheduledFor: new Date(2026, 9, 8), isAllDay: true, commitments: [c('week', WEEK)] })
    expect(weekListTasks([picked, dated], WEEK, null).map((t) => t.id)).toEqual(['p', 'x'])
  })

  it('drops a row whose commitment for this week was carried forward or removed', () => {
    const carried = createMockTask({ id: 'c', commitments: [c('week', WEEK, 'carried', new Date(2026, 9, 11))] })
    const removed = createMockTask({ id: 'r', commitments: [c('week', WEEK, 'removed')] })
    expect(weekListTasks([carried, removed], WEEK, null)).toEqual([])
  })

  it('is scoped to me exactly as the month page is: a row assigned only to someone else is not mine', () => {
    const theirs = createMockTask({ id: 't', bucket: 'week', weekStart: WEEK, assignedTo: 'them', commitments: [c('week', WEEK)] })
    const shared = createMockTask({ id: 's', bucket: 'week', weekStart: WEEK, assignedToAll: ['me', 'them'], commitments: [c('week', WEEK)] })
    expect(weekListTasks([theirs, shared], WEEK, 'me').map((t) => t.id)).toEqual(['s'])
  })

  it('a legacy row (no records) with the week bucket and stamp is on the list', () => {
    const legacy = createMockTask({ id: 'l', bucket: 'week', weekStart: WEEK, commitments: undefined })
    expect(weekListTasks([legacy], WEEK, null).map((t) => t.id)).toEqual(['l'])
  })
})

describe('weekRowNote', () => {
  it('says where the row came from, its day, and whether it is picked for today', () => {
    const t = createMockTask({ id: 'k', bucket: 'timed', scheduledFor: new Date(2026, 9, 8), isAllDay: true,
      focus: [{ userId: 'me', date: new Date(2026, 9, 6) }],
      commitments: [c('week', LAST, 'carried', WEEK), c('week', WEEK), c('month', new Date(2026, 9, 1))] })
    const n = weekRowNote(t, WEEK, 'me', '2026-10-06')
    expect(n).toEqual({ origin: 'kept', monthLabel: 'October', dayLabel: 'Thu', pickedToday: true })
    expect(weekRowNoteText(n)).toBe('kept from last week · Thu · picked for today')
  })
  it('a month task copied down says "from October"; a plain row says nothing', () => {
    const m = createMockTask({ id: 'm', bucket: 'week', weekStart: WEEK, commitments: [c('week', WEEK), c('month', new Date(2026, 9, 1))] })
    expect(weekRowNoteText(weekRowNote(m, WEEK, 'me', '2026-10-06'))).toBe('from October')
    const p = createMockTask({ id: 'p', bucket: 'week', weekStart: WEEK, commitments: [c('week', WEEK)] })
    expect(weekRowNoteText(weekRowNote(p, WEEK, 'me', '2026-10-06'))).toBeUndefined()
  })
})
