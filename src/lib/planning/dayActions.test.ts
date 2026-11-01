import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createMockTask } from '@/test/mocks/factories'
import type { Task } from '@/types/task'
import { planPlacement } from '@/lib/placement/intentions'
import { isFocused } from '@/lib/placement/model'
import { localYmd } from '@/lib/cadence/config'
import { makePlanActions } from './planActions'
import { makeDayActions, onThisWeek } from './dayActions'

// One task in memory, written the way the app writes it: every update goes
// through the placement module, so the fields read back are the real ones.
function world(start: Task, now: Date) {
  let task = start
  const updateTask = vi.fn(async (_id: string, u: Partial<Task>) => { task = planPlacement(task, u, { now, userId: 'scott' }).local; return true })
  const pushTask = vi.fn(async (_id: string, target: Date | 'week' | 'month' | 'quarter') => {
    if (target !== 'week') throw new Error('not in this test')
    task = planPlacement(task, { bucket: 'week', scheduledFor: undefined }, { now, userId: 'scott' }).local
    return true
  })
  const plan = makePlanActions({
    findTask: () => task, updateTask, pushTask,
    setRoutinePlanned: vi.fn(async () => true), rescheduleRoutine: vi.fn(async () => null),
  })
  const actions = makeDayActions({ plan, updateTask, toggle: vi.fn() })
  return { actions, get task() { return task }, pushTask }
}
const weekOf = (t: Task) => (t.commitments ?? []).filter((c) => c.level === 'week' && c.status === 'open').map((c) => localYmd(c.periodStart))

// The week setting lives on the device (cadence config).
const weekStartsOn = (d: 0 | 6) => localStorage.setItem('symphony-cadence-config', JSON.stringify({ weekStartsOn: d }))

describe('makeDayActions', () => {
  afterEach(() => { vi.useRealTimers(); localStorage.removeItem('symphony-cadence-config') })

  describe('in the morning (Tuesday Nov 3, a Sunday-start week)', () => {
    const TUE = new Date(2026, 10, 3, 9), MON = new Date(2026, 10, 2), today = new Date(2026, 10, 3)
    beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(TUE) })

    it('a look-back "Today" puts it on today, chosen; Undo puts it back exactly as it was', async () => {
      const before = createMockTask({ id: 't', title: 'Email Dana', bucket: 'timed', scheduledFor: MON, isAllDay: true, weekStart: new Date(2026, 10, 1), focus: [{ userId: 'scott', date: MON }] })
      const w = world(before, TUE)
      expect(await w.actions.place(before, today)).toBe(true)
      expect(localYmd(w.task.scheduledFor!)).toBe('2026-11-03')
      expect(isFocused(w.task, 'scott', '2026-11-03')).toBe(true)
      expect(await w.actions.restore(before)).toBe(true)
      expect(localYmd(w.task.scheduledFor!)).toBe('2026-11-02')
      expect(w.task.isAllDay).toBe(true)
      expect(isFocused(w.task, 'scott', '2026-11-03')).toBe(false)
      expect(isFocused(w.task, 'scott', '2026-11-02')).toBe(true)
      expect(weekOf(w.task)).toEqual(['2026-11-01'])
    })

    it('a pick at a time, undone, leaves no day and no time behind', async () => {
      const before = createMockTask({ id: 't', title: 'Inventory', bucket: 'week', weekStart: new Date(2026, 10, 1), scheduledFor: undefined, isAllDay: undefined })
      const w = world(before, TUE)
      expect(await w.actions.place(before, today, '14:30')).toBe(true)
      expect(w.task.scheduledFor).toEqual(new Date(2026, 10, 3, 14, 30))
      await w.actions.restore(before)
      expect(w.task.scheduledFor).toBeUndefined()
      expect(weekOf(w.task)).toEqual(['2026-11-01'])
    })
  })

  describe('"Back to this week" across a week boundary', () => {
    it('Sunday-start: on Sunday morning yesterday was last week; it lands on this week, and Undo takes that week off again', async () => {
      const SUN = new Date(2026, 10, 1, 9), SAT = new Date(2026, 9, 31)
      vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(SUN); weekStartsOn(0)
      const before = createMockTask({ id: 't', title: 'Fix the gate', bucket: 'timed', scheduledFor: SAT, isAllDay: true,
        commitments: [{ level: 'week', periodStart: new Date(2026, 9, 25), status: 'open' }] })
      const w = world(before, SUN)
      expect(onThisWeek(before, SUN, 0)).toBe(false)
      expect(await w.actions.backToWeek(before, SAT)).toBe(true)
      expect(w.task.scheduledFor).toBeUndefined()
      expect(weekOf(w.task)).toEqual(['2026-11-01'])
      await w.actions.restore(before)
      expect(weekOf(w.task)).toEqual(['2026-10-25'])
      expect(localYmd(w.task.scheduledFor!)).toBe('2026-10-31')
    })

    it('Saturday-start: on Saturday morning yesterday (Friday) was last week; it lands on this week', async () => {
      const SAT = new Date(2026, 9, 31, 9), FRI = new Date(2026, 9, 30)
      vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(SAT); weekStartsOn(6)
      const before = createMockTask({ id: 't', title: 'Fix the gate', bucket: 'timed', scheduledFor: FRI, isAllDay: true,
        commitments: [{ level: 'week', periodStart: new Date(2026, 9, 24), status: 'open' }] })
      const w = world(before, SAT)
      expect(onThisWeek(before, SAT, 6)).toBe(false)
      await w.actions.backToWeek(before, FRI)
      expect(weekOf(w.task)).toEqual(['2026-10-31'])
    })

    it('already on this week: no second week is written', async () => {
      const TUE = new Date(2026, 10, 3, 9), MON = new Date(2026, 10, 2)
      vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(TUE)
      const before = createMockTask({ id: 't', title: 'Fix the gate', bucket: 'timed', scheduledFor: MON, isAllDay: true,
        commitments: [{ level: 'week', periodStart: new Date(2026, 10, 1), status: 'open' }] })
      const w = world(before, TUE)
      expect(onThisWeek(before, TUE, 0)).toBe(true)
      await w.actions.backToWeek(before, MON)
      expect(w.pushTask).not.toHaveBeenCalled()
      expect(weekOf(w.task)).toEqual(['2026-11-01'])
      expect(w.task.scheduledFor).toBeUndefined()
    })
  })
})
