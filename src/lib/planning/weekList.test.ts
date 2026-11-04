import { describe, it, expect } from 'vitest'
import { createMockTask } from '@/test/mocks/factories'
import { weekListTasks, weekRowNote, weekRowNoteText, weekShownTasks, earlierThisWeek, earlierDayMark } from './weekList'

const WEEK = new Date(2026, 9, 4)   // Sunday Oct 4, 2026
const LAST = new Date(2026, 8, 27)  // Sunday Sep 27
const c = (level: 'week' | 'month', periodStart: Date, status: 'open' | 'done' | 'carried' | 'removed' = 'open', carriedTo?: Date) =>
  ({ level, periodStart, status, carriedTo })

describe('weekListTasks', () => {
  // 2026-10-04: no goal/task split above the week — a line once marked a goal
  // that is given this week is on the week's list like any other.
  it('is every task committed to the week, done rows and old goal lines included, in creation order', () => {
    const a = createMockTask({ id: 'a', title: 'A', bucket: 'week', weekStart: WEEK, createdAt: new Date(2026, 9, 1), commitments: [c('week', WEEK)] })
    const done = createMockTask({ id: 'd', title: 'D', bucket: 'week', weekStart: WEEK, completed: true, createdAt: new Date(2026, 8, 30), commitments: [c('week', WEEK, 'done')] })
    const goal = createMockTask({ id: 'g', title: 'G', isGoal: true, bucket: 'week', weekStart: WEEK, commitments: [c('week', WEEK)] })
    const other = createMockTask({ id: 'o', title: 'O', bucket: 'week', weekStart: LAST, commitments: [c('week', LAST)] })
    expect(weekListTasks([a, done, goal, other], WEEK, null).map((t) => t.id).sort()).toEqual(['a', 'd', 'g'])
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
    expect(n).toEqual({ origin: 'kept', dayLabel: 'Thu, Oct 8', pickedToday: true })
    expect(weekRowNoteText(n)).toBe('kept from last week · Thu, Oct 8 · picked for today')
  })
  it('a day that came and went with the row open reads as missed, with its date', () => {
    const t = createMockTask({ id: 'x', bucket: 'timed', scheduledFor: new Date(2026, 9, 5), isAllDay: true, commitments: [c('week', WEEK)] })
    expect(weekRowNoteText(weekRowNote(t, WEEK, 'me', '2026-10-06'))).toBe('missed Mon, Oct 5')
    expect(weekRowNoteText(weekRowNote(t, WEEK, 'me', '2026-10-05'))).toBe('Mon, Oct 5')
  })
  // Paper-style horizons (2026-11-04): "from October" was a tie line.
  it('a row also on a month says nothing about it; a plain row says nothing', () => {
    const m = createMockTask({ id: 'm', bucket: 'week', weekStart: WEEK, commitments: [c('week', WEEK), c('month', new Date(2026, 9, 1))] })
    expect(weekRowNoteText(weekRowNote(m, WEEK, 'me', '2026-10-06'))).toBeUndefined()
    const p = createMockTask({ id: 'p', bucket: 'week', weekStart: WEEK, commitments: [c('week', WEEK)] })
    expect(weekRowNoteText(weekRowNote(p, WEEK, 'me', '2026-10-06'))).toBeUndefined()
  })
})

describe('weekShownTasks', () => {
  // Paper-style horizons (2026-11-04): the week's count covers the rows the
  // page draws, and the page draws a task marked is_goal like any other.
  it('counts a task marked a goal, on the list or on a day', () => {
    const listed = createMockTask({ id: 'g', isGoal: true, bucket: 'week', weekStart: WEEK, commitments: [c('week', WEEK)] })
    const dated = createMockTask({ id: 'h', isGoal: true, scheduledFor: new Date(2026, 9, 6) })
    expect(weekShownTasks({ listed: [listed], drawn: [listed, dated], weekStart: WEEK }).map((t) => t.id)).toEqual(['g', 'h'])
  })
})

// Visual check on real data (2026-11-04): an undated legacy completion is on
// no week, even one recorded with no week stamp and no commitments.
describe('weekListTasks — undated legacy completions', () => {
  it('leaves out a done week row with no completed_at, stamp or commitment', () => {
    const legacy = createMockTask({ id: 'l', title: 'fix the light', bucket: 'week', completed: true, commitments: [] })
    const open = createMockTask({ id: 'o', title: 'Open', bucket: 'week', commitments: [] })
    expect(weekListTasks([legacy, open], WEEK, null, { isCurrent: true }).map((t) => t.id)).toEqual(['o'])
  })
})

// Task 4 (Scott, 2026-11-04): yesterday's unfinished tasks go back where
// they came from, the week sheet beside the day, first and marked with their
// day. One selector, read by Today's sheet and the workspace's.
describe('earlierThisWeek', () => {
  const SUN = new Date(2026, 10, 1)            // week of Sun Nov 1
  const WED = new Date(2026, 10, 4)            // the viewed day
  const on = (d: number, x: Partial<Parameters<typeof createMockTask>[0]> = {}) =>
    createMockTask({ id: `t${d}${x.title ?? ''}`, title: x.title ?? `Day ${d}`, bucket: 'timed', scheduledFor: new Date(2026, 10, d, 9), isAllDay: true, ...x })
  it('is what has a day earlier this week, before the viewed day, open and not let go, oldest day first', () => {
    const tasks = [
      on(3, { title: 'Tue thing' }), on(2, { title: 'Mon thing' }),
      on(3, { title: 'Done Tue', completed: true }),
      on(3, { title: 'Let go Tue', dismissedAt: new Date(2026, 10, 3, 20) }),
      on(4, { title: 'Today' }), on(5, { title: 'Thu' }),
      on(31, { title: 'Last week', scheduledFor: new Date(2026, 9, 31) }),
      createMockTask({ id: 'u', title: 'No day', bucket: 'week' }),
    ]
    const got = earlierThisWeek(tasks, { weekStart: SUN, day: WED })
    expect(got.map((t) => t.title)).toEqual(['Mon thing', 'Tue thing'])
    expect(got.map(earlierDayMark)).toEqual(['Mon', 'Tue'])
  })
  it('leaves out what was chosen for the viewed day, and keeps to the page’s filters', () => {
    const chosen = on(3, { title: 'Chosen', focus: [{ userId: 'me', date: WED }] })
    const theirs = on(3, { title: 'Theirs', assignedTo: 'kid' })
    const mine = on(3, { title: 'Mine', assignedTo: 'me' })
    expect(earlierThisWeek([chosen, theirs, mine], { weekStart: SUN, day: WED, userId: 'me' }).map((t) => t.title)).toEqual(['Theirs', 'Mine'])
    expect(earlierThisWeek([theirs, mine], { weekStart: SUN, day: WED, scopeId: 'me' }).map((t) => t.title)).toEqual(['Mine'])
    expect(earlierThisWeek([theirs, mine], { weekStart: SUN, day: WED, keep: (t) => t.assignedTo === 'kid' }).map((t) => t.title)).toEqual(['Theirs'])
  })
  it('is nothing on the week’s first day', () => {
    expect(earlierThisWeek([on(31, { scheduledFor: new Date(2026, 9, 31) })], { weekStart: SUN, day: SUN })).toEqual([])
  })
  // Pre-ship follow-ups (2026-11-04).
  it('skips a one-off event whose time has passed (“Dinner: Trick or Treat Pizza Party”)', () => {
    const party = on(31, { title: 'Dinner: Trick or Treat Pizza Party', category: 'event', scheduledFor: new Date(2026, 9, 31, 18) })
    const errand = on(3, { title: 'Return the books', category: 'errand' })
    const SAT = new Date(2026, 9, 31)
    expect(earlierThisWeek([party, errand], { weekStart: SAT, day: WED, now: new Date(2026, 10, 4, 9) }).map((t) => t.title)).toEqual(['Return the books'])
  })
  it('stops at today: viewing Friday from Wednesday, Thursday’s tasks are not leftovers, nor Wednesday’s', () => {
    const FRI = new Date(2026, 10, 6)
    const tasks = [on(3, { title: 'Tue thing' }), on(4, { title: 'Wed thing' }), on(5, { title: 'Thu thing' })]
    expect(earlierThisWeek(tasks, { weekStart: SUN, day: FRI, now: new Date(2026, 10, 4, 9) }).map((t) => t.title)).toEqual(['Tue thing'])
    // Viewing a day gone by, it stops at that day.
    expect(earlierThisWeek(tasks, { weekStart: SUN, day: new Date(2026, 10, 3), now: new Date(2026, 10, 4, 9) })).toEqual([])
  })
  it('on tomorrow’s page (the evening session), today’s open tasks are left over too', () => {
    const THU = new Date(2026, 10, 5)
    const tasks = [on(3, { title: 'Tue thing' }), on(4, { title: 'Wed thing' }), on(5, { title: 'Thu thing' })]
    const got = earlierThisWeek(tasks, { weekStart: SUN, day: THU, now: new Date(2026, 10, 4, 18) })
    expect(got.map((t) => t.title)).toEqual(['Tue thing', 'Wed thing'])
    expect(got.map(earlierDayMark)).toEqual(['Tue', 'Wed'])
  })
})
