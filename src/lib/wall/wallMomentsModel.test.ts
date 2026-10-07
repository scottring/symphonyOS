import { describe, it, expect } from 'vitest'
import { wallTodayRows, specialsWeek, checklistFor, afterSchoolRows } from './wallMomentsModel'
import type { TimelineItem } from '@/types/timeline'
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

// Scott, 2026-10-07: "the individual tasks … are only relevant to me — we
// should be more focused on shared tasks and stuff involving the kids".
describe('wallTodayRows — the family’s screen', () => {
  const task = (id: string, o: Partial<TimelineItem>) => item({ id, type: 'task', title: id, startTime: at(8, 30), ...o })
  it('leaves one adult’s own task off, and keeps shared, kids’ and household tasks and every event', () => {
    const rows = wallTodayRows({ morning: [
      task('task-mine', { assignedTo: 'sk' }),
      task('task-shared', { originalTask: { assignedToAll: ['sk', 'el'] } as never, assignedTo: null }),
      task('task-ella', { assignedTo: 'el' }),
      task('task-house', {}),
      item({ id: 'event-jury', title: 'Jury duty', startTime: at(8), assignedTo: 'sk' }),
    ] }, members, at(7))
    expect(rows.map((r) => r.id).sort()).toEqual(['event-jury', 'task-ella', 'task-house', 'task-shared'])
  })
})
