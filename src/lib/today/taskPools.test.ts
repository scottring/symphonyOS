import { describe, it, expect } from 'vitest'
import {
  selectOverdue, selectInbox, selectWeek, selectCompletedInbox, selectTimed,
  selectCarriedOver, selectSlipped, graceFloor,
} from './taskPools'
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

  describe('grace window partition', () => {
    // TODAY is 2026-05-19. Grace = 2 days → 05-17 and 05-18 are carried over,
    // 05-16 and older are slipped.
    const d1 = task({ id: 'd1', scheduledFor: new Date('2026-05-18T09:00:00') })
    const d2 = task({ id: 'd2', scheduledFor: new Date('2026-05-17T09:00:00') })
    const d3 = task({ id: 'd3', scheduledFor: new Date('2026-05-16T09:00:00') })
    const old = task({ id: 'old', scheduledFor: new Date('2025-09-01T09:00:00') })
    const pool = [d1, d2, d3, old]

    it('selectCarriedOver: keeps items inside the grace window', () => {
      expect(selectCarriedOver(pool, true, all, TODAY).map(x => x.id)).toEqual(['d1', 'd2'])
    })

    it('selectSlipped: keeps items past the grace window', () => {
      expect(selectSlipped(pool, true, all, TODAY).map(x => x.id)).toEqual(['d3', 'old'])
    })

    it('the two partitions exactly reconstruct selectOverdue', () => {
      const overdue = selectOverdue(pool, true, all, TODAY).map(x => x.id).sort()
      const split = [
        ...selectCarriedOver(pool, true, all, TODAY),
        ...selectSlipped(pool, true, all, TODAY),
      ].map(x => x.id).sort()
      expect(split).toEqual(overdue)
    })

    it('the two partitions are disjoint', () => {
      const carried = new Set(selectCarriedOver(pool, true, all, TODAY).map(x => x.id))
      const slipped = selectSlipped(pool, true, all, TODAY).map(x => x.id)
      expect(slipped.filter(id => carried.has(id))).toEqual([])
    })

    it('boundary: exactly graceDays old is carried over, one day more is slipped', () => {
      const onBoundary = task({ id: 'b', scheduledFor: new Date('2026-05-17T23:59:00') })
      const pastBoundary = task({ id: 'p', scheduledFor: new Date('2026-05-16T00:01:00') })
      expect(selectCarriedOver([onBoundary, pastBoundary], true, all, TODAY).map(x => x.id)).toEqual(['b'])
      expect(selectSlipped([onBoundary, pastBoundary], true, all, TODAY).map(x => x.id)).toEqual(['p'])
    })

    it('ignores the wall clock on both sides — late-evening now still partitions by date', () => {
      const lateNow = new Date('2026-05-19T23:45:00')
      const d = task({ id: 'x', scheduledFor: new Date('2026-05-17T00:05:00') })
      expect(selectCarriedOver([d], true, all, lateNow).map(x => x.id)).toEqual(['x'])
    })

    it('returns [] when not today, like selectOverdue', () => {
      expect(selectCarriedOver(pool, false, all, TODAY)).toEqual([])
      expect(selectSlipped(pool, false, all, TODAY)).toEqual([])
    })

    it('a task completed today stays in the carried-over lane', () => {
      const doneToday = task({
        id: 'done', scheduledFor: new Date('2026-05-18'),
        completed: true, updatedAt: new Date('2026-05-19T08:00:00'),
      })
      expect(selectCarriedOver([doneToday], true, all, TODAY).map(x => x.id)).toEqual(['done'])
    })
  })

  describe('subtask containment', () => {
    it('selectOverdue: a subtask copying the parent timestamp gets no row of its own', () => {
      const at = new Date('2026-05-17T09:00:00')
      const child = task({ id: 'c1', parentTaskId: 'p1', scheduledFor: at })
      const parent = task({ id: 'p1', scheduledFor: at, subtasks: [child] })
      expect(selectOverdue([parent], true, all, TODAY).map(x => x.id)).toEqual(['p1'])
    })

    it('selectOverdue: a subtask with its OWN different date keeps its row', () => {
      const child = task({ id: 'c1', parentTaskId: 'p1', scheduledFor: new Date('2026-05-15T09:00:00') })
      const parent = task({ id: 'p1', scheduledFor: new Date('2026-05-17T09:00:00'), subtasks: [child] })
      expect(selectOverdue([parent], true, all, TODAY).map(x => x.id).sort()).toEqual(['c1', 'p1'])
    })

    it('selectOverdue: a subtask with its own TIME on the parent day keeps its row', () => {
      const child = task({ id: 'c1', parentTaskId: 'p1', scheduledFor: new Date('2026-05-17T14:00:00') })
      const parent = task({ id: 'p1', scheduledFor: new Date('2026-05-17T09:00:00'), subtasks: [child] })
      expect(selectOverdue([parent], true, all, TODAY).map(x => x.id).sort()).toEqual(['c1', 'p1'])
    })

    it('selectOverdue: an orphan subtask (parent undated) keeps its row', () => {
      const child = task({ id: 'c1', parentTaskId: 'p1', scheduledFor: new Date('2026-05-15T09:00:00') })
      const parent = task({ id: 'p1', bucket: 'inbox', scheduledFor: null, subtasks: [child] })
      expect(selectOverdue([parent], true, all, TODAY).map(x => x.id)).toEqual(['c1'])
    })

    it('selectTimed: a subtask copying the parent timestamp gets no row of its own', () => {
      const at = new Date('2026-05-19T09:00:00')
      const child = task({ id: 'c1', parentTaskId: 'p1', bucket: 'timed', scheduledFor: at })
      const parent = task({ id: 'p1', bucket: 'timed', scheduledFor: at, subtasks: [child] })
      expect(selectTimed([parent], TODAY, all).map(x => x.id)).toEqual(['p1'])
    })

    it('selectTimed: a subtask timed on the day while the parent is undated keeps its row', () => {
      const child = task({ id: 'c1', parentTaskId: 'p1', bucket: 'timed', scheduledFor: new Date('2026-05-19T09:00:00') })
      const parent = task({ id: 'p1', bucket: 'inbox', scheduledFor: null, subtasks: [child] })
      expect(selectTimed([parent], TODAY, all).map(x => x.id)).toEqual(['c1'])
    })

    it('the five vacation steps collapse to one row (regression: 2026-08-03)', () => {
      const at = new Date('2026-05-17T04:00:00')
      const steps = ['s1', 's2', 's3', 's4', 's5'].map((id) =>
        task({ id, parentTaskId: 'vac', scheduledFor: at }))
      const parent = task({ id: 'vac', scheduledFor: at, subtasks: steps })
      expect(selectOverdue([parent], true, all, TODAY).map(x => x.id)).toEqual(['vac'])
    })
  })

  describe('graceFloor', () => {
    it('is midnight, graceDays before the given date', () => {
      const floor = graceFloor(new Date('2026-08-03T18:42:11'))
      expect(floor.getFullYear()).toBe(2026)
      expect(floor.getMonth()).toBe(7) // August
      expect(floor.getDate()).toBe(1)
      expect(floor.getHours()).toBe(0)
      expect(floor.getMinutes()).toBe(0)
      expect(floor.getSeconds()).toBe(0)
      expect(floor.getMilliseconds()).toBe(0)
    })

    it('crosses a month boundary', () => {
      expect(graceFloor(new Date('2026-08-01T12:00:00')).getMonth()).toBe(6) // July
      expect(graceFloor(new Date('2026-08-01T12:00:00')).getDate()).toBe(30)
    })

    it('honours an explicit graceDays', () => {
      expect(graceFloor(new Date('2026-08-03T12:00:00'), 0).getDate()).toBe(3)
      expect(graceFloor(new Date('2026-08-03T12:00:00'), 10).getDate()).toBe(24)
    })

    it('agrees with the partition: anything at the floor is carried over', () => {
      const now = new Date('2026-08-03T12:00:00')
      const atFloor = task({ id: 'f', scheduledFor: graceFloor(now) })
      expect(selectCarriedOver([atFloor], true, all, now).map(x => x.id)).toEqual(['f'])
    })
  })
})
