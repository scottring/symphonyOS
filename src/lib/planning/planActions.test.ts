import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { makePlanActions, type PlanActionDeps } from './planActions'
import { createMockTask } from '@/test/mocks/factories'
import type { Task } from '@/types/task'

const SAT = new Date(2026, 8, 19)

function setup(tasks: Task[]) {
  const undo: (() => void)[] = []
  const deps = {
    findTask: (id: string) => tasks.find((t) => t.id === id),
    updateTask: vi.fn(async () => true),
    pushTask: vi.fn(async () => true),
    setRoutinePlanned: vi.fn(async () => true),
    rescheduleRoutine: vi.fn(async () => null),
    pushAction: vi.fn((_m: string, u: () => void) => { undo.push(u) }),
    notify: vi.fn(),
  } satisfies PlanActionDeps
  return { deps, actions: makePlanActions(deps), undo }
}

describe('plan actions — tasks', () => {
  // SAT is "today" for these tests: the Today command is date + focus only on
  // the real today (S4); every other day is a date and nothing else.
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 8, 19, 9, 0)) })
  afterEach(() => { vi.useRealTimers() })
  const THU = new Date(2026, 8, 24)

  it('"Today" on a week-list task dates it today AND chooses it (S4); the week commitment is the placement module\'s to keep', async () => {
    const { deps, actions } = setup([createMockTask({ id: 'w', bucket: 'week', weekStart: new Date(2026, 8, 13) })])
    await actions.chooseTaskDay('w', new Date(2026, 8, 19, 15, 30))
    expect(deps.updateTask).toHaveBeenCalledWith('w', { bucket: 'timed', scheduledFor: SAT, isAllDay: true, plannedOn: SAT })
  })

  it('"Today" on anything else dates it all-day AND chooses it — no time invented', async () => {
    const { deps, actions } = setup([createMockTask({ id: 'i', bucket: 'inbox' })])
    await actions.chooseTaskDay('i', SAT)
    expect(deps.updateTask).toHaveBeenCalledWith('i', { bucket: 'timed', scheduledFor: SAT, isAllDay: true, plannedOn: SAT })
  })

  it('choosing another day dates it and does NOT create focus (S4)', async () => {
    const { deps, actions } = setup([createMockTask({ id: 'w', bucket: 'week' })])
    await actions.chooseTaskDay('w', THU)
    expect(deps.updateTask).toHaveBeenCalledWith('w', { bucket: 'timed', scheduledFor: THU, isAllDay: true })
  })

  it('a Week day drop dates the task and does NOT create focus, even onto today', async () => {
    const { deps, actions } = setup([createMockTask({ id: 'w', title: 'W', bucket: 'week' })])
    await actions.drop({ kind: 'task', id: 'w', date: '2026-09-19', title: 'W' }, { type: 'day', day: SAT })
    expect(deps.updateTask).toHaveBeenCalledWith('w', { bucket: 'timed', scheduledFor: SAT, isAllDay: true })
  })

  it('a drop on Today itself is the Today command: date + focus', async () => {
    const { deps, actions } = setup([createMockTask({ id: 'w', title: 'W', bucket: 'week' })])
    await actions.drop({ kind: 'task', id: 'w', date: '2026-09-19', title: 'W' }, { type: 'day', day: SAT }, { chooseOnly: true })
    expect(deps.updateTask).toHaveBeenCalledWith('w', { bucket: 'timed', scheduledFor: SAT, isAllDay: true, plannedOn: SAT })
  })

  it('undo puts back exactly what was there, focus rows included', async () => {
    const earlier = { userId: 'scott', date: new Date(2026, 8, 17) }
    const t = createMockTask({ id: 'i', bucket: 'inbox', scheduledFor: undefined, isAllDay: undefined, plannedOn: undefined, focus: [earlier] })
    const { deps, actions, undo } = setup([t])
    await actions.chooseTaskDay('i', SAT)
    undo[0]()
    expect(deps.updateTask).toHaveBeenLastCalledWith('i', { bucket: 'inbox', scheduledFor: undefined, isAllDay: undefined, focus: [earlier] })
  })

  it('un-choosing clears only the viewed day\'s focus — other days kept, nothing un-dated', async () => {
    const other = { userId: 'scott', date: new Date(2026, 8, 17) }
    const t = createMockTask({ id: 'd', bucket: 'timed', scheduledFor: SAT, isAllDay: true, focus: [other, { userId: 'scott', date: SAT }] })
    const { deps, actions, undo } = setup([t])
    await actions.unchooseTask('d', SAT)
    expect(deps.updateTask).toHaveBeenCalledWith('d', { focus: [other] })
    expect(deps.pushTask).not.toHaveBeenCalled()
    undo[0]()
    expect(deps.updateTask).toHaveBeenLastCalledWith('d', { focus: t.focus })
  })

  it('a time is the existing scheduling write, with a default half hour', async () => {
    const { deps, actions } = setup([createMockTask({ id: 't' })])
    const when = new Date(2026, 8, 19, 14, 0)
    await actions.drop({ kind: 'task', id: 't', date: '2026-09-19', title: 'T' }, { type: 'time', when })
    expect(deps.updateTask).toHaveBeenCalledWith('t', expect.objectContaining({ bucket: 'timed', scheduledFor: when, isAllDay: false }))
  })

  it('a period commits to the list with no day invented, and keeps personal focus (S13)', async () => {
    const { deps, actions } = setup([createMockTask({ id: 'd', bucket: 'timed', scheduledFor: SAT, isAllDay: true, focus: [{ userId: 'scott', date: SAT }] })])
    await actions.drop({ kind: 'task', id: 'd', date: '2026-09-19', title: 'D' }, { type: 'period', period: 'week' })
    expect(deps.pushTask).toHaveBeenCalledWith('d', 'week')
    expect(deps.updateTask).not.toHaveBeenCalled()
  })
})

describe('plan actions — routine occurrences', () => {
  const payload = { kind: 'routine' as const, id: 'r1', date: '2026-09-19', title: 'Laundry' }

  it('choosing writes the occurrence only — the routine (its rule) is never updated', async () => {
    const { deps, actions } = setup([])
    await actions.drop(payload, { type: 'day', day: SAT })
    expect(deps.setRoutinePlanned).toHaveBeenCalledWith('r1', SAT, true)
    expect(deps.updateTask).not.toHaveBeenCalled()
  })

  it('refuses a day-only move to ANOTHER day, and says how to do it', async () => {
    const { deps, actions } = setup([])
    await actions.drop(payload, { type: 'day', day: new Date(2026, 8, 20) })
    expect(deps.setRoutinePlanned).not.toHaveBeenCalled()
    expect(deps.notify).toHaveBeenCalledWith(expect.stringMatching(/with a time/))
  })

  it('a time is the one-day override from the occurrence\'s own date', async () => {
    const { deps, actions } = setup([])
    const when = new Date(2026, 8, 20, 9, 0)
    await actions.drop(payload, { type: 'time', when })
    expect(deps.rescheduleRoutine).toHaveBeenCalledWith('r1', SAT, when)
  })

  it('is never committed to a list', async () => {
    const { deps, actions } = setup([])
    await actions.drop(payload, { type: 'period', period: 'week' })
    expect(deps.pushTask).not.toHaveBeenCalled()
    expect(deps.notify).toHaveBeenCalled()
  })

  it('undo un-chooses the same occurrence', async () => {
    const { deps, actions, undo } = setup([])
    await actions.chooseRoutine('r1', SAT, true, 'Laundry')
    undo[0]()
    expect(deps.setRoutinePlanned).toHaveBeenLastCalledWith('r1', SAT, false)
  })
})

it('reports a cancelled or failed Today placement without publishing a success undo', async () => {
  const { deps, actions } = setup([createMockTask({ id: 'task' })])
  deps.updateTask.mockResolvedValue(false)
  expect(await actions.chooseTaskDay('task', SAT)).toBe(false)
  expect(deps.pushAction).not.toHaveBeenCalled()
  expect(await actions.chooseTaskDay('missing', SAT)).toBe(false)
})

it('plans the existing task for a flexible weekend without a day or time', async () => {
  const task = createMockTask({ id: 'task', bucket: 'month', monthStart: new Date(2026, 8, 1) })
  const { deps, actions } = setup([task])
  const saturday = new Date(2026, 8, 26)
  expect(await actions.planTaskWeekend('task', saturday)).toBe(true)
  expect(deps.updateTask).toHaveBeenCalledWith('task', expect.objectContaining({
    bucket: 'week', weekendStart: saturday, scheduledFor: undefined, isAllDay: false, plannedOn: undefined,
  }))
  expect(deps.updateTask.mock.calls[0][1]).not.toHaveProperty('monthStart')
})

it('undo restores the flexible weekend after choosing another day', async () => {
  const weekendStart = new Date(2026, 8, 26)
  const { actions, deps, undo } = setup([createMockTask({ id: 'weekend', bucket: 'week', weekendStart })])
  await actions.chooseTaskDay('weekend', new Date(2026, 8, 28), { focus: false })
  undo[0]()
  expect(deps.updateTask).toHaveBeenLastCalledWith('weekend', expect.objectContaining({ weekendStart, scheduledFor: undefined }))
})
it('a cancelled time placement does not offer undo for an unwritten change', async () => {
  const { actions, deps, undo } = setup([createMockTask({ id: 'task' })])
  deps.updateTask.mockResolvedValueOnce(false)
  await actions.timeTask('task', new Date(2026, 8, 28, 10))
  expect(undo).toHaveLength(0)
})
