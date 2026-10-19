import { describe, it, expect } from 'vitest'
import { createMockTask } from '@/test/mocks/factories'
import type { Task } from '@/types/task'
import { buildTodayChoice, buildTodayReview } from './chooseToday'

const MON = new Date(2026, 9, 19, 9)
const task = (o: Partial<Task>) => createMockTask({ createdAt: new Date(2026, 9, 1), ...o })

describe('buildTodayChoice', () => {
  it('missed days first; no-day items grouped by their October goal, Also this week last; other days folded; today’s left out', () => {
    const goal = task({ id: 'G', title: 'Organize documents', bucket: 'month' })
    const inv = task({ id: 'i', title: 'Inventory', parentTaskId: 'G' })
    const helmet = task({ id: 'h', title: 'Buy Ella a helmet', scheduledFor: new Date(2026, 9, 18), bucket: 'timed' })
    const mail = task({ id: 'm', title: 'Process paper mail' })
    const dentist = task({ id: 'd', title: 'Reschedule dentist', scheduledFor: new Date(2026, 9, 22), bucket: 'timed' })
    const todays = task({ id: 't', title: 'Already today', scheduledFor: new Date(2026, 9, 19), bucket: 'timed' })
    const done = task({ id: 'x', title: 'Done one', completed: true })
    const c = buildTodayChoice({ week: [mail, inv, helmet, dentist, todays, done], allTasks: [{ ...goal, subtasks: [inv] }, helmet, mail, dentist, todays], today: MON, monthWord: 'October' })
    expect(c.missed.map((m) => [m.task.id, m.label])).toEqual([['h', 'Was Sunday']])
    expect(c.groups.map((g) => [g.title, g.tasks.map((t) => t.id)])).toEqual([['October goal · Organize documents', ['i']], ['Also this week', ['m']]])
    expect(c.otherDays.map((o) => [o.task.id, o.day])).toEqual([['d', 'Thu']])
  })
})

describe('buildTodayReview', () => {
  it('splits what today held into open and done', () => {
    const a = task({ id: 'a', title: 'Open', scheduledFor: new Date(2026, 9, 19), bucket: 'timed' })
    const b = task({ id: 'b', title: 'Done', scheduledFor: new Date(2026, 9, 19), bucket: 'timed', completed: true })
    const c = task({ id: 'c', title: 'Tomorrow', scheduledFor: new Date(2026, 9, 20), bucket: 'timed' })
    const r = buildTodayReview({ allTasks: [a, b, c], today: MON })
    expect(r.open.map((t) => t.id)).toEqual(['a'])
    expect(r.done.map((t) => t.id)).toEqual(['b'])
  })
})
