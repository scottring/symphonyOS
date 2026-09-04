import { describe, it, expect, beforeEach } from 'vitest'
import {
  unscheduledPool, applyPoolView, orderPool, groupPool, isMealTask,
  readPoolView, writePoolView, type PoolCtx,
} from './poolViews'
import type { Task } from '@/types/task'

// Fixture builder — values shaped like what the hooks hand the components
// (Dates hydrated, optional fields absent unless set).
let n = 0
function task(over: Partial<Task> = {}): Task {
  n += 1
  return {
    id: `t${n}`,
    title: over.title ?? `Task ${n}`,
    completed: false,
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-01'),
    ...over,
  } as Task
}

const today = new Date(2026, 7, 31) // Mon Aug 31 2026, local
const ctx: PoolCtx = {
  today,
  rangeStart: new Date(2026, 7, 31),
  rangeEnd: new Date(2026, 8, 2), // Wed Sep 2
  weekStartsOn: 0,
}

describe('unscheduledPool', () => {
  it('keeps undated, drops completed and future-deferred', () => {
    const a = task({})
    const pool = unscheduledPool([
      a,
      task({ completed: true }),
      task({ deferredUntil: new Date(2026, 8, 20) }),
    ], ctx)
    expect(pool.map((t) => t.id)).toEqual([a.id])
  })

  it('excludes tasks scheduled inside the visible range, resurfaces past-scheduled', () => {
    const past = task({ scheduledFor: new Date(2026, 7, 20, 10) })
    const allDayUndated = task({ isAllDay: true })
    const pool = unscheduledPool([
      task({ scheduledFor: new Date(2026, 8, 1, 10) }),             // on the grid → out
      past,                                                          // past → resurfaces
      task({ isAllDay: true, scheduledFor: new Date(2026, 8, 2) }),  // all-day in range → out
      allDayUndated,                                                 // all-day undated → in
    ], ctx)
    expect(pool.map((t) => t.id).sort()).toEqual([past.id, allDayUndated.id].sort())
  })

  // Demo walkthrough 2026-09-04: paper-planned all-day tasks dated NEXT week
  // ("Pay water bill", Thu 9/10) sat under UNSCHEDULED on this week's shelf,
  // and this week's Saturday errands sat under UNSCHEDULED on next week's.
  // A dated all-day task outside the grid is placed, not unscheduled — only
  // a past one resurfaces, the same as a timed task.
  it('drops future-dated all-day tasks outside the range, resurfaces past-dated ones', () => {
    const nextWeek = task({ isAllDay: true, scheduledFor: new Date(2026, 8, 10) })
    const lastWeek = task({ isAllDay: true, scheduledFor: new Date(2026, 7, 25) })
    const pool = unscheduledPool([nextWeek, lastWeek], ctx)
    expect(pool.map((t) => t.id)).toEqual([lastWeek.id])
    // and the week view agrees on its own
    expect(applyPoolView([nextWeek, lastWeek], 'week', ctx).map((t) => t.id)).toEqual([lastWeek.id])
  })
})

describe('unscheduledPool — assignee scoping', () => {
  // "Pick out an outfit or two for Boston" (context family, assigned to Iris)
  // sat in Scott's planning pool: shared context rightly makes it VISIBLE, but
  // planning MY time must only offer tasks I could actually do.
  it("excludes tasks assigned exclusively to someone else when meId is given", () => {
    const mine = task({ assignedTo: 'me' })
    const shared = task({ assignedTo: 'iris', assignedToAll: ['iris', 'me'] })
    const unassigned = task({})
    const hers = task({ assignedTo: 'iris' })
    const pool = unscheduledPool([mine, shared, unassigned, hers], { ...ctx, meId: 'me' })
    expect(pool.map((t) => t.id).sort()).toEqual([mine.id, shared.id, unassigned.id].sort())
  })

  it('keeps everything when meId is not provided', () => {
    const hers = task({ assignedTo: 'iris' })
    expect(unscheduledPool([hers], ctx).map((t) => t.id)).toEqual([hers.id])
  })
})

describe('applyPoolView', () => {
  const carried = task({ scheduledFor: new Date(2026, 7, 20, 9) })
  const thisWeek = task({ bucket: 'week', weekStart: new Date(2026, 7, 30) })
  const staleWeek = task({ bucket: 'week', weekStart: new Date(2026, 7, 16) })
  const futureWeek = task({ bucket: 'week', weekStart: new Date(2026, 8, 13) })
  const monthMove = task({ bucket: 'month' })
  const inboxItem = task({ bucket: 'inbox' })
  const allDay = task({ isAllDay: true })
  const pool = [carried, thisWeek, staleWeek, futureWeek, monthMove, inboxItem, allDay]

  it("'week' = this week + stale placements + carried-over + all-day; future weeks and month/inbox stay out", () => {
    const ids = applyPoolView(pool, 'week', ctx).map((t) => t.id)
    expect(ids).toContain(carried.id)
    expect(ids).toContain(thisWeek.id)
    expect(ids).toContain(staleWeek.id)
    expect(ids).toContain(allDay.id)
    expect(ids).not.toContain(futureWeek.id)
    expect(ids).not.toContain(monthMove.id)
    expect(ids).not.toContain(inboxItem.id)
  })

  it("'month' = month bucket only", () => {
    expect(applyPoolView(pool, 'month', ctx).map((t) => t.id)).toEqual([monthMove.id])
  })

  it("'all' = everything", () => {
    expect(applyPoolView(pool, 'all', ctx)).toHaveLength(pool.length)
  })
})

describe('orderPool', () => {
  it('carried/stale first, then week bucket, then all-day, then the rest — stable', () => {
    const allDay = task({ isAllDay: true })
    const weekT = task({ bucket: 'week', weekStart: new Date(2026, 7, 30) })
    const carried = task({ scheduledFor: new Date(2026, 7, 20, 9) })
    const loose = task({ bucket: 'inbox' })
    const ordered = orderPool([allDay, weekT, carried, loose], ctx)
    expect(ordered.map((t) => t.id)).toEqual([carried.id, weekT.id, allDay.id, loose.id])
  })
})

describe('isMealTask / groupPool', () => {
  it('matches cook/dinner/meal titles, conservative on the rest', () => {
    expect(isMealTask(task({ title: 'Cook Monday dinner: Sesame tofu bowl' }))).toBe(true)
    expect(isMealTask(task({ title: 'Meal prep: hard-boil 10 eggs' }))).toBe(true)
    expect(isMealTask(task({ title: 'Sunday dinner' }))).toBe(true)
    expect(isMealTask(task({ title: 'Call VW Parkville lease turn in' }))).toBe(false)
    expect(isMealTask(task({ title: 'Wash and clean bookbags' }))).toBe(false)
  })

  it('splits meals from loose, preserving order', () => {
    const a = task({ title: 'Cook Saturday dinner' })
    const b = task({ title: 'Respond to Christian' })
    const { meals, loose } = groupPool([a, b])
    expect(meals.map((t) => t.id)).toEqual([a.id])
    expect(loose.map((t) => t.id)).toEqual([b.id])
  })
})

describe('pool view persistence', () => {
  beforeEach(() => {
    localStorage.removeItem('symphony-pool-view:overlay')
    localStorage.removeItem('symphony-pool-view:weekbench')
  })

  it('round-trips per surface and defaults to week', () => {
    expect(readPoolView('overlay')).toBe('week')
    writePoolView('overlay', 'month')
    expect(readPoolView('overlay')).toBe('month')
    expect(readPoolView('weekbench')).toBe('week') // other surface untouched
  })
})
