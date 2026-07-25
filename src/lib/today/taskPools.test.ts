import { describe, it, expect } from 'vitest'
import { selectOverdue, selectInbox, selectWeek, selectCompletedInbox, selectTimed } from './taskPools'
import type { Task } from '@/types/task'

const TODAY = new Date('2026-05-19T12:00:00')
function task(p: Partial<Task>): Task {
  return {
    id: 'id', title: 't', completed: false, bucket: 'timed',
    scheduledFor: null, assignedTo: null, updatedAt: new Date('2026-05-19T12:00:00'),
    subtasks: undefined,
    ...p,
  } as Task
}
const all = () => true

describe('taskPools', () => {
  it('selectOverdue: past-dated incomplete task is overdue when isToday', () => {
    const t = task({ id: 'o1', bucket: 'timed', scheduledFor: new Date('2026-05-17T09:00:00') })
    expect(selectOverdue([t], true, all, TODAY).map(x => x.id)).toEqual(['o1'])
  })
  it('selectOverdue: returns [] when not today', () => {
    const t = task({ scheduledFor: new Date('2026-05-17T09:00:00') })
    expect(selectOverdue([t], false, all, TODAY)).toEqual([])
  })
  it('selectOverdue: completed task only if completed today', () => {
    const doneOld = task({ id: 'a', scheduledFor: new Date('2026-05-10'), completed: true, updatedAt: new Date('2026-05-10') })
    const doneToday = task({ id: 'b', scheduledFor: new Date('2026-05-10'), completed: true, updatedAt: new Date('2026-05-19T08:00:00') })
    const ids = selectOverdue([doneOld, doneToday], true, all, TODAY).map(x => x.id)
    expect(ids).toContain('b')
    expect(ids).not.toContain('a')
  })
  it('selectOverdue: includes overdue subtasks', () => {
    const parent = task({ id: 'p', bucket: 'timed', scheduledFor: new Date('2026-05-19'),
      subtasks: [task({ id: 's', scheduledFor: new Date('2026-05-10') })] as Task[] })
    expect(selectOverdue([parent], true, all, TODAY).map(x => x.id)).toContain('s')
  })
  it('selectInbox: only bucket=inbox, incomplete, when today', () => {
    const i = task({ id: 'i', bucket: 'inbox' })
    const done = task({ id: 'd', bucket: 'inbox', completed: true })
    expect(selectInbox([i, done], true, all).map(x => x.id)).toEqual(['i'])
    expect(selectInbox([i], false, all)).toEqual([])
  })
  it('selectWeek: only bucket=week, incomplete, when today', () => {
    const w = task({ id: 'w', bucket: 'week' })
    expect(selectWeek([w], true, all).map(x => x.id)).toEqual(['w'])
    expect(selectWeek([w], false, all)).toEqual([])
  })
  it('selectWeek: scoped to the current week — a later week\'s placement stays off Today', () => {
    const thisWeek = task({ id: 'now', bucket: 'week', weekStart: new Date(2026, 6, 19) })
    const laterWeek = task({ id: 'later', bucket: 'week', weekStart: new Date(2026, 7, 9) })
    const legacy = task({ id: 'legacy', bucket: 'week' })
    const ids = selectWeek([thisWeek, laterWeek, legacy], true, all, new Date(2026, 6, 19)).map(x => x.id)
    expect(ids).toEqual(['now', 'legacy'])
  })
  it('selectCompletedInbox: completed non-timed updated on viewed date', () => {
    const c = task({ id: 'c', bucket: 'inbox', completed: true, updatedAt: new Date('2026-05-19T10:00:00') })
    const timed = task({ id: 'x', bucket: 'timed', completed: true, updatedAt: new Date('2026-05-19T10:00:00') })
    const ids = selectCompletedInbox([c, timed], new Date('2026-05-19T00:00:00'), all).map(x => x.id)
    expect(ids).toEqual(['c'])
  })
  it('selectTimed: bucket=timed on viewed date, plus scheduled subtasks', () => {
    const t = task({ id: 't1', bucket: 'timed', scheduledFor: new Date('2026-05-19T09:00:00'),
      subtasks: [task({ id: 'sub', bucket: 'timed', scheduledFor: new Date('2026-05-19T10:00:00') })] as Task[] })
    const other = task({ id: 'no', bucket: 'timed', scheduledFor: new Date('2026-05-20T09:00:00') })
    const ids = selectTimed([t, other], new Date('2026-05-19T00:00:00'), all).map(x => x.id)
    expect(ids).toEqual(['t1', 'sub'])
  })
})
