import { describe, it, expect } from 'vitest'
import { toPlanEntries, type DayPlanEntry } from './dayPlan'
import type { Task, TaskCommitment } from '@/types/task'
import type { Routine } from '@/types/actionable'

// The ONE planning list (Scott, 2026-09-21): unfinished work, this week's
// undated tasks and routines with no day yet — each once, with a line of
// context, and nothing you already put on a day.

let n = 0
const task = (over: Partial<Task> = {}): Task => ({
  id: `t${++n}`, title: `Task ${n}`, completed: false, createdAt: new Date(2026, 8, 1, 0, 0, n), updatedAt: new Date(), bucket: 'inbox', ...over,
} as Task)
const c = (level: TaskCommitment['level'], periodStart: Date): TaskCommitment => ({ level, periodStart, status: 'open' })
const routine = (over: Partial<Routine> = {}): Routine => ({
  id: `r${++n}`, name: `Routine ${n}`, recurrence_pattern: { type: 'weekly', days: [] }, ...over,
} as unknown as Routine)

const NOW = new Date(2026, 8, 21, 10) // Monday
const WEEK = new Date(2026, 8, 20)    // Sunday anchor
const LAST_WEEK = new Date(2026, 8, 13)
const WK27 = new Date(2026, 8, 27)
const SEP = new Date(2026, 8, 1)
const match = () => true
const args = (over: Partial<Parameters<typeof toPlanEntries>[0]> = {}) => ({
  tasks: [], match, weekStart: WEEK, ymd: '2026-09-21', userId: 'me', now: NOW,
  available: [], unhomed: [], routineById: new Map<string, Routine>(), ...over,
})

describe('toPlanEntries', () => {
  it('unfinished first (oldest first), then this week, then routines', () => {
    const sat = task({ title: 'Order Comma 4', bucket: 'timed', scheduledFor: new Date(2026, 8, 19), isAllDay: true })
    const fri = task({ title: 'Plan reading', bucket: 'timed', scheduledFor: new Date(2026, 8, 18), isAllDay: true })
    const week = task({ title: 'Talk to HEMS', bucket: 'week', weekStart: WEEK, commitments: [c('month', SEP), c('week', WEEK)] })
    const r = routine({ name: 'Take out recycling' })
    const out = toPlanEntries(args({ tasks: [sat, week, fri], unhomed: [r] }))
    expect(out.map((e) => e.title)).toEqual(['Plan reading', 'Order Comma 4', 'Talk to HEMS', 'Take out recycling'])
    expect(out.map((e) => e.context)).toEqual(['Originally Friday', 'Originally Saturday', 'September plan', 'Weekly routine · no set day'])
    expect(out.every((e) => e.group === 'plan')).toBe(true)
  })

  it('a row with a day is on that day, not here; a chosen row is on the main list, not here', () => {
    const dated = task({ bucket: 'timed', scheduledFor: new Date(2026, 8, 23) })
    const chosen = task({ title: 'Chosen', bucket: 'week', weekStart: WEEK, focus: [{ userId: 'me', date: new Date(2026, 8, 21) }] })
    const chosenMiss = task({ bucket: 'timed', scheduledFor: new Date(2026, 8, 19), focus: [{ userId: 'me', date: new Date(2026, 8, 21) }] })
    expect(toPlanEntries(args({ tasks: [dated, chosen, chosenMiss] }))).toEqual([])
  })

  it('a week placement left behind by an earlier week says which week', () => {
    const left = task({ bucket: 'week', weekStart: LAST_WEEK })
    const [e] = toPlanEntries(args({ tasks: [left] }))
    expect(e.context).toBe('Planned for Sep 13 – Sep 19')
  })

  it('older misses fall outside the 14-day window and stay off the list', () => {
    const old = task({ bucket: 'timed', scheduledFor: new Date(2026, 7, 1) })
    expect(toPlanEntries(args({ tasks: [old] }))).toEqual([])
  })

  // Review, 2026-09-21: "left behind" is judged against the REAL current
  // week. Paging /week forward must not relabel this week's open placements.
  it('a placement on the current week is not "unfinished" just because a later week is on screen', () => {
    const onThisWeek = task({ title: 'This week', bucket: 'week', weekStart: WEEK })
    const out = toPlanEntries(args({ tasks: [onThisWeek], weekStart: WK27 }))
    expect(out.map((e) => [e.title, e.context])).toEqual([])
    // ...and it is still this week's row when this week is on screen.
    expect(toPlanEntries(args({ tasks: [onThisWeek], weekStart: WEEK })).map((e) => e.context)).toEqual([undefined])
  })

  it('a week task with no month says nothing extra; one on a month names the month', () => {
    const plain = task({ bucket: 'week', weekStart: WEEK })
    const onMonth = task({ bucket: 'week', weekStart: WEEK, commitments: [c('month', SEP), c('week', WEEK)] })
    const out = toPlanEntries(args({ tasks: [plain, onMonth] }))
    expect(out.map((e) => e.context)).toEqual([undefined, 'September plan'])
  })

  it("the day's flexible occurrences ride along with their cadence; a chosen one is on the main list, not here", () => {
    const daily = routine({ id: 'd', name: 'Stretch', recurrence_pattern: { type: 'daily' } as Routine['recurrence_pattern'] })
    const available: DayPlanEntry[] = [
      { key: 'routine:d', kind: 'routine', id: 'd', title: 'Stretch', completed: false, planned: false, group: 'available' },
      { key: 'routine:x', kind: 'routine', id: 'x', title: 'Chosen one', completed: false, planned: true, group: 'available' },
    ]
    const out = toPlanEntries(args({ available, routineById: new Map([['d', daily]]) }))
    expect(out.map((e) => [e.title, e.context])).toEqual([['Stretch', 'Daily routine']])
  })

  it('each action appears once', () => {
    const r = routine({ id: 'w', name: 'Recycling' })
    const available: DayPlanEntry[] = [{ key: 'routine:w', kind: 'routine', id: 'w', title: 'Recycling', completed: false, planned: false, group: 'available' }]
    const out = toPlanEntries(args({ available, unhomed: [r], routineById: new Map([['w', r]]) }))
    expect(out).toHaveLength(1)
  })

  it('respects the assignee lens', () => {
    const theirs = task({ bucket: 'week', weekStart: WEEK, assignedTo: 'iris' })
    const out = toPlanEntries(args({ tasks: [theirs], match: (a) => a !== 'iris' }))
    expect(out).toEqual([])
  })
})
