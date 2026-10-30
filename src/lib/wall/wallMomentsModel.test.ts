import { describe, it, expect } from 'vitest'
import { wallTodayRows, wallAnytimeRows, stillOnToday, specialsWeek, checklistFor, afterSchoolRows, bagWithPapers, kidSchoolWork } from './wallMomentsModel'
import { taskToTimelineItem, type TimelineItem } from '@/types/timeline'
import type { FamilyMember } from '@/types/family'
import type { MemberDayModel } from './kidDayModel'
import type { WallDayData } from '@/hooks/useWallData'

const members = [
  { id: 'sk', name: 'Scott', initials: 'SK', color: 'blue', role_label: 'parent', is_full_user: true },
  { id: 'el', name: 'Ella', initials: 'EL', color: 'pink', role_label: 'child' },
  { id: 'ka', name: 'Kaleb', initials: 'KA', color: 'green', role_label: 'child' },
] as unknown as FamilyMember[]

const at = (h: number, m = 0) => new Date(2026, 9, 6, h, m)
const item = (o: Partial<TimelineItem>) => ({ id: 'x', type: 'event', title: 'X', startTime: null, endTime: null, completed: false, ...o }) as TimelineItem

// The wall, by time of day (Scott, 2026-10-04; mockup "Wall, by time of day").
describe('wallTodayRows', () => {
  it('is today’s timed things in order, past ones marked, everyday routines left out', () => {
    const items = {
      allday: [item({ id: 'event-sp', title: 'Specials — Ella: Library · Kaleb: Art', allDay: true })],
      morning: [
        item({ id: 'event-school', title: 'School — Ella & Kaleb', startTime: at(7, 30), endTime: at(14, 10), location: 'Hampden Elementary' }),
        item({ id: 'routine-brush', type: 'routine', title: 'Brush teeth', startTime: at(7), recurrencePattern: { type: 'daily' } as never }),
      ],
      afternoon: [
        item({ id: 'routine-hw', type: 'routine', title: 'Homework time', startTime: at(16, 15), recurrencePattern: { type: 'weekly', days: ['tue'] } as never, owners: ['el', 'ka'] }),
      ],
      evening: [], night: [], anytime: [], earlyMorning: [], overdue: [],
    } as unknown as Record<string, TimelineItem[]>
    const rows = wallTodayRows(items, members, at(15))
    expect(rows.map((r) => r.title)).toEqual(['School — Ella & Kaleb', 'Homework time'])
    expect(rows[0]).toMatchObject({ time: '7:30a', end: '2:10p', sub: 'Hampden Elementary', past: true })
    expect(rows[1]).toMatchObject({ time: '4:15p', past: false })
    expect(rows[1].owners).toEqual(['el', 'ka'])
  })
})

describe('specialsWeek', () => {
  const day = (d: number, title: string | null): WallDayData => ({
    date: new Date(2026, 9, d), isToday: d === 6,
    items: { allday: title ? [item({ id: `event-${d}`, title, allDay: true })] : [] } as never,
    birthdays: [], milestones: [],
  })
  it('one row per school day, each kid’s special, today marked', () => {
    const week = specialsWeek([
      day(5, 'Specials — Ella: Visual Art · Kaleb: PE'),
      day(6, 'Specials — Ella: Library · Kaleb: Art'),
      day(10, null),
    ], members.filter((m) => m.id !== 'sk'), new Date(2026, 9, 6))
    expect(week.map((w) => [w.day, w.cells.map((c) => c.text), w.isToday])).toEqual([
      ['Mon', ['Visual Art', 'PE'], false],
      ['Tue', ['Library', 'Art'], true],
    ])
  })
})

describe('checklistFor', () => {
  const model = {
    collections: [
      { id: 'c1', title: 'Out the door', timeOfDay: '07:00', rows: [{ entityType: 'routine', id: 'r1', title: 'Shoes', done: false, timeOfDay: null, target: null }] },
      { id: 'c2', title: 'Bedtime', timeOfDay: '19:00', rows: [{ entityType: 'routine', id: 'r2', title: 'Brush teeth', done: true, timeOfDay: null, target: null }] },
    ],
    bands: { morning: [], afternoon: [{ entityType: 'routine', id: 'r3', title: 'Reading', done: false, timeOfDay: '16:30', target: null }], evening: [], anytime: [] },
  } as unknown as MemberDayModel
  it('picks the list for the part of the day', () => {
    expect(checklistFor(model, 'morning')?.title).toBe('Out the door')
    expect(checklistFor(model, 'evening')?.rows[0].title).toBe('Brush teeth')
    expect(checklistFor(model, 'after')).toMatchObject({ title: 'This afternoon', rows: [{ title: 'Reading' }] })
  })
})

// Scott, 2026-10-07: "a bunch of redundancies on the wall".
describe('wallTodayRows — a task’s steps fold into it', () => {
  it('shows a task with three steps at 8:30 as one row saying "3 steps"', () => {
    const parent = item({ id: 'task-p', type: 'task', title: 'Brainstorm vacation ideas', startTime: at(8, 30) })
    const step = (n: number) => item({ id: `task-s${n}`, type: 'task', title: `Step ${n}`, startTime: at(8, 30), isSubtask: true, parentTaskId: 'p' })
    const rows = wallTodayRows({ morning: [parent, step(1), step(2), step(3)] }, members, at(7))
    expect(rows.map((r) => r.title)).toEqual(['Brainstorm vacation ideas'])
    expect(rows[0].sub).toBe('3 steps')
  })

  it('keeps a step whose task is not on the day', () => {
    const rows = wallTodayRows({ morning: [item({ id: 'task-s1', type: 'task', title: 'Lone step', startTime: at(9), isSubtask: true, parentTaskId: 'elsewhere' })] }, members, at(7))
    expect(rows.map((r) => r.title)).toEqual(['Lone step'])
  })
})

describe('afterSchoolRows', () => {
  const row = (id: string, title: string) => ({ entityType: 'routine' as const, id, title, done: false, timeOfDay: '16:30', target: null })
  const model = {
    homework: [
      { id: 'h1', title: 'Reading log', due: 'Tomorrow', late: false, notes: null },
      { id: 'h2', title: 'Science poster', due: 'Fri', late: false, notes: null },
      { id: 'h3', title: 'Spelling sheet', due: 'Mon', late: true, notes: null },
    ],
    reading: { ...row('read', 'Read'), target: { amount: 20, unit: 'minutes', progress: 0, streak: 0 } },
    bands: { morning: [row('shoes', 'Shoes')], afternoon: [row('math', 'Ella & Kaleb math time')], evening: [row('bath', 'Bath')], anytime: [] },
    collections: [{ id: 'c', title: 'Homework time', timeOfDay: '16:00', rows: [row('spell', 'Spelling practice'), row('math', 'Ella & Kaleb math time')] }],
  } as unknown as MemberDayModel

  it('lists homework due by tomorrow or late, then reading and math practice, once each', () => {
    expect(afterSchoolRows(model).map((r) => r.title)).toEqual([
      'Reading log · due tomorrow', 'Spelling sheet · late', 'Read', 'Ella & Kaleb math time', 'Spelling practice',
    ])
  })

  it('makes homework a task row the wall can tick off', () => {
    expect(afterSchoolRows(model)[0]).toMatchObject({ entityType: 'task', id: 'h1', done: false })
  })
})

// Scott, 2026-10-17: "if there's a family task on Today The Day it should
// also show on the kiosk" — this replaces 2026-10-07's rule that kept one
// adult's own task off the wall.
describe('wallTodayRows — the family’s screen', () => {
  const task = (id: string, o: Partial<TimelineItem>) => item({ id, type: 'task', title: id, startTime: at(8, 30), ...o })
  it('keeps every timed family task — one adult’s, shared, a kid’s, the household’s — and every event', () => {
    const rows = wallTodayRows({ morning: [
      task('task-mine', { assignedTo: 'sk' }),
      task('task-shared', { originalTask: { assignedToAll: ['sk', 'el'] } as never, assignedTo: null }),
      task('task-ella', { assignedTo: 'el' }),
      task('task-house', {}),
      item({ id: 'event-jury', title: 'Jury duty', startTime: at(8), assignedTo: 'sk' }),
    ] }, members, at(7))
    expect(rows.map((r) => r.id).sort()).toEqual(['event-jury', 'task-ella', 'task-house', 'task-mine', 'task-shared'])
  })

  it('keeps a task that is past its time but not done on the rest of today; a past event leaves', () => {
    const rows = wallTodayRows({ morning: [
      task('task-poop', { startTime: at(10) }),
      task('task-done', { startTime: at(10), completed: true }),
      item({ id: 'event-swim', title: 'Swim', startTime: at(9), endTime: at(10) }),
      task('task-later', { startTime: at(16) }),
    ] }, members, at(14))
    expect(rows.filter(stillOnToday).map((r) => r.id)).toEqual(['task-poop', 'task-later'])
    expect(rows.find((r) => r.id === 'task-poop')).toMatchObject({ past: true, open: true })
  })

  it('names everyone a shared task is assigned to, not just its first assignee', () => {
    const shared = taskToTimelineItem({ id: 'poop', title: 'pick up poop', completed: false, createdAt: at(0), updatedAt: at(0),
      scheduledFor: at(10), isAllDay: false, assignedTo: 'sk', assignedToAll: ['sk', 'el'] } as never)
    const rows = wallTodayRows({ morning: [shared] }, members, at(7))
    expect(rows.map((r) => [r.id, r.owners])).toEqual([['task-poop', ['sk', 'el']]])
  })
})

// Out the door (spec 2026-10-20): a paper a parent has, due today and not yet
// in the backpack, rides in that kid's bag line.
describe('bagWithPapers', () => {
  const p = (over: Partial<Parameters<typeof bagWithPapers>[1][number]>) =>
    ({ id: 'p', title: 'Pink health form', due: 'Today', late: false, heldBy: 'iris', done: false, ...over })
  it('a held paper due today rides in the bag line', () => {
    expect(bagWithPapers(['Library book'], [p({})])).toEqual(['Library book', 'Pink health form'])
  })
  it('not when nobody has it, it is done, or it is not due today', () => {
    expect(bagWithPapers([], [p({ heldBy: null }), p({ done: true }), p({ due: 'Thu' })])).toEqual([])
  })
})

describe('kidSchoolWork', () => {
  const row = (id: string, title: string, timeOfDay: string | null = null, o: object = {}) => ({ entityType: 'routine' as const, id, title, done: false, timeOfDay, target: null, ...o })
  const now = new Date(2026, 9, 29, 11) // a Thursday
  const day = (d: number) => new Date(2026, 9, d)
  const model = {
    homework: [
      { id: 'late', title: 'Spelling sheet', due: 'Late', late: true, notes: null, dueOn: day(27) },
      { id: 'today', title: 'Math retest review', due: 'Today', late: false, notes: null, dueOn: day(29) },
      { id: 'fri', title: 'Reading log', due: 'Tomorrow', late: false, notes: null, dueOn: day(30) },
      { id: 'u4', title: 'Study for Unit 4 math test', due: 'Nov 5', late: false, notes: null, dueOn: new Date(2026, 10, 5) },
      { id: 'far', title: 'Science fair board', due: 'Nov 12', late: false, notes: null, dueOn: new Date(2026, 10, 12) },
    ],
    reading: null,
    bands: {
      morning: [], afternoon: [row('soccer', 'Soccer practice', '16:00')],
      evening: [row('gal', 'Puzzle Trail: 1 round', '18:45')], anytime: [row('app', 'Typing club', null, { app: { url: 'x' } })],
    },
    collections: [
      { id: 'am', title: 'School morning', timeOfDay: '06:45', rows: [row('bag', 'Bag packed: homework folder')] },
      { id: 'home', title: 'Home from school', timeOfDay: '17:45', rows: [row('folder', 'Empty take-home folder'), row('read', 'Reading, 20 minutes')] },
      { id: 'bed', title: 'Bedtime', timeOfDay: '19:30', rows: [row('own', 'Own reading or Yoto')] },
    ],
  } as unknown as MemberDayModel

  it("today: homework due by tomorrow or late, the home-from-school routine's reading and math, and loose practice like Puzzle Trail", () => {
    const { today } = kidSchoolWork(model, now)
    expect(today.map((w) => [w.row.title, w.note])).toEqual([
      ['Spelling sheet', 'late'], ['Math retest review', 'today'], ['Reading log', 'for tomorrow'],
      ['Reading, 20 minutes', null], ['Puzzle Trail: 1 round', '6:45'], ['Typing club', null],
    ])
  })

  it('never the bag step, bedtime reading, or soccer practice', () => {
    const titles = kidSchoolWork(model, now).today.map((w) => w.row.title)
    expect(titles).not.toContain('Bag packed: homework folder')
    expect(titles).not.toContain('Own reading or Yoto')
    expect(titles).not.toContain('Soccer practice')
  })

  it('this week: homework due in the seven days after tomorrow, nothing further out', () => {
    expect(kidSchoolWork(model, now).week).toEqual([{ id: 'u4', title: 'Study for Unit 4 math test', due: 'Nov 5' }])
  })
})

describe('wallAnytimeRows', () => {
  it('lists untimed routines and untimed tasks due today, merging a title two kids carry', () => {
    const rows = wallAnytimeRows({
      morning: [
        item({ id: 'task-1', type: 'task', title: 'Return picture day order form', assignedTo: members[1].id }),
        item({ id: 'task-2', type: 'task', title: 'Return picture day order form', assignedTo: members[2].id }),
        item({ id: 'task-3', type: 'task', title: 'Call the plumber', startTime: at(14).toISOString() }),
        item({ id: 'task-4', type: 'task', title: 'Done already', completed: true }),
        item({ id: 'task-5', type: 'task', title: 'A step', isSubtask: true, parentTaskId: '1' }),
        item({ id: 'routine-1', type: 'routine', title: 'Water the plants' }),
        item({ id: 'event-1', type: 'event', title: 'Picnic', allDay: true }),
      ],
    } as Record<string, TimelineItem[]>, members)
    expect(rows.map((r) => r.title)).toEqual(['Return picture day order form', 'Water the plants'])
    expect(rows[0].owners).toEqual([members[1].id, members[2].id])
  })
})
