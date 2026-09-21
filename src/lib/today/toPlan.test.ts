import { describe, it, expect } from 'vitest'
import { toPlanEntries, unfinishedEntries, type DayPlanEntry } from './dayPlan'
import type { Task, TaskCommitment } from '@/types/task'
import type { Routine } from '@/types/actionable'

// The week's list (Scott, 2026-09-21): this week's undated tasks and routines
// with no day yet — each once, with a line of context, and nothing you already
// put on a day. Unfinished work from earlier is its own list, on request,
// newest first — it never floods the week's list (Scott, 2026-09-21 evening).

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
  tasks: [], match, weekStart: WEEK, ymd: '2026-09-21', userId: 'me',
  available: [], unhomed: [], routineById: new Map<string, Routine>(), ...over,
})
const uargs = (over: Partial<Parameters<typeof unfinishedEntries>[0]> = {}) => ({
  tasks: [], match, ymd: '2026-09-21', userId: 'me', now: NOW, ...over,
})

const sat = () => task({ title: 'Order Comma 4', bucket: 'timed', scheduledFor: new Date(2026, 8, 19), isAllDay: true })
const fri = () => task({ title: 'Plan reading', bucket: 'timed', scheduledFor: new Date(2026, 8, 18), isAllDay: true })
const leftBehind = () => task({ title: 'Left behind', bucket: 'week', weekStart: LAST_WEEK })

describe("toPlanEntries — the week's list", () => {
  it("this week's undated tasks, then routines — unfinished work from earlier is NOT here", () => {
    const week = task({ title: 'Talk to HEMS', bucket: 'week', weekStart: WEEK, commitments: [c('month', SEP), c('week', WEEK)] })
    const r = routine({ name: 'Take out recycling' })
    const out = toPlanEntries(args({ tasks: [sat(), week, fri(), leftBehind()], unhomed: [r] }))
    expect(out.map((e) => e.title)).toEqual(['Talk to HEMS', 'Take out recycling'])
    expect(out.map((e) => e.context)).toEqual(['September plan', 'Weekly routine · no set day'])
    expect(out.every((e) => e.group === 'plan')).toBe(true)
  })

  it('a row with a day is on that day, not here; a chosen row is on the main list, not here', () => {
    const dated = task({ bucket: 'timed', scheduledFor: new Date(2026, 8, 23) })
    const chosen = task({ title: 'Chosen', bucket: 'week', weekStart: WEEK, focus: [{ userId: 'me', date: new Date(2026, 8, 21) }] })
    expect(toPlanEntries(args({ tasks: [dated, chosen] }))).toEqual([])
  })

  // Review, 2026-09-21: the list is the week ON SCREEN. This week's placement
  // is not on next week's list, and is this week's row when this week shows.
  it('a placement on the current week is on the list only when that week is on screen', () => {
    const onThisWeek = task({ title: 'This week', bucket: 'week', weekStart: WEEK })
    expect(toPlanEntries(args({ tasks: [onThisWeek], weekStart: WK27 }))).toEqual([])
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
    expect(toPlanEntries(args({ tasks: [theirs], match: (a) => a !== 'iris' }))).toEqual([])
  })
})

describe('unfinishedEntries — unfinished from earlier, on request', () => {
  it('misses inside the 14-day window and week placements left behind, NEWEST first', () => {
    const out = unfinishedEntries(uargs({ tasks: [fri(), leftBehind(), sat()] }))
    expect(out.map((e) => e.title)).toEqual(['Order Comma 4', 'Plan reading', 'Left behind'])
    expect(out.map((e) => e.context)).toEqual(['Originally Saturday', 'Originally Friday', 'Planned for Sep 13 – Sep 19'])
    expect(out.every((e) => e.group === 'unfinished' && !e.planned)).toBe(true)
  })

  it('older misses fall outside the 14-day window and stay off the list', () => {
    const old = task({ bucket: 'timed', scheduledFor: new Date(2026, 7, 1) })
    expect(unfinishedEntries(uargs({ tasks: [old] }))).toEqual([])
  })

  // "Left behind" is judged against the REAL current week, never the week on
  // screen — there is no week-on-screen input here at all.
  it('a placement on the current week is not unfinished', () => {
    const onThisWeek = task({ bucket: 'week', weekStart: WEEK })
    expect(unfinishedEntries(uargs({ tasks: [onThisWeek] }))).toEqual([])
  })

  it('a chosen miss is on the main list, not here; a done one is done', () => {
    const chosenMiss = task({ bucket: 'timed', scheduledFor: new Date(2026, 8, 19), focus: [{ userId: 'me', date: new Date(2026, 8, 21) }] })
    const done = task({ bucket: 'timed', scheduledFor: new Date(2026, 8, 19), completed: true })
    expect(unfinishedEntries(uargs({ tasks: [chosenMiss, done] }))).toEqual([])
  })

  it('respects the assignee lens', () => {
    const theirs = task({ bucket: 'timed', scheduledFor: new Date(2026, 8, 19), assignedTo: 'iris' })
    expect(unfinishedEntries(uargs({ tasks: [theirs], match: (a) => a !== 'iris' }))).toEqual([])
  })
})
