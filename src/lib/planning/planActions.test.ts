import { describe, it, expect, vi } from 'vitest'
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
  it('choosing a day for a week-list task writes planned_on only: the list commitment stays', async () => {
    const { deps, actions } = setup([createMockTask({ id: 'w', bucket: 'week', weekStart: new Date(2026, 8, 13) })])
    await actions.chooseTaskDay('w', new Date(2026, 8, 19, 15, 30))
    expect(deps.updateTask).toHaveBeenCalledWith('w', { plannedOn: SAT })
  })

  it('choosing a day for anything else dates it all-day AND chooses it — no time invented', async () => {
    const { deps, actions } = setup([createMockTask({ id: 'i', bucket: 'inbox' })])
    await actions.chooseTaskDay('i', SAT)
    expect(deps.updateTask).toHaveBeenCalledWith('i', { bucket: 'timed', scheduledFor: SAT, isAllDay: true, plannedOn: SAT })
  })

  it('a Week day drop dates even a week-list task (it appears on that day in Journal and Schedule)', async () => {
    const { deps, actions } = setup([createMockTask({ id: 'w', title: 'W', bucket: 'week' })])
    await actions.drop({ kind: 'task', id: 'w', date: '2026-09-19', title: 'W' }, { type: 'day', day: SAT })
    expect(deps.updateTask).toHaveBeenCalledWith('w', { bucket: 'timed', scheduledFor: SAT, isAllDay: true, plannedOn: SAT })
  })

  it('a drop on Today itself only chooses the day', async () => {
    const { deps, actions } = setup([createMockTask({ id: 'w', title: 'W', bucket: 'week' })])
    await actions.drop({ kind: 'task', id: 'w', date: '2026-09-19', title: 'W' }, { type: 'day', day: SAT }, { chooseOnly: true })
    expect(deps.updateTask).toHaveBeenCalledWith('w', { plannedOn: SAT })
  })

  it('undo puts back exactly what was there', async () => {
    const t = createMockTask({ id: 'i', bucket: 'inbox', scheduledFor: undefined, isAllDay: undefined, plannedOn: undefined })
    const { deps, actions, undo } = setup([t])
    await actions.chooseTaskDay('i', SAT)
    undo[0]()
    expect(deps.updateTask).toHaveBeenLastCalledWith('i', { bucket: 'inbox', scheduledFor: undefined, isAllDay: undefined, plannedOn: undefined })
  })

  it('un-choosing clears only the choice — nothing deleted, nothing un-dated', async () => {
    const { deps, actions } = setup([createMockTask({ id: 'd', bucket: 'timed', scheduledFor: SAT, isAllDay: true, plannedOn: SAT })])
    await actions.unchooseTask('d')
    expect(deps.updateTask).toHaveBeenCalledWith('d', { plannedOn: undefined })
    expect(deps.pushTask).not.toHaveBeenCalled()
  })

  it('a time is the existing scheduling write, with a default half hour', async () => {
    const { deps, actions } = setup([createMockTask({ id: 't' })])
    const when = new Date(2026, 8, 19, 14, 0)
    await actions.drop({ kind: 'task', id: 't', date: '2026-09-19', title: 'T' }, { type: 'time', when })
    expect(deps.updateTask).toHaveBeenCalledWith('t', expect.objectContaining({ bucket: 'timed', scheduledFor: when, isAllDay: false }))
  })

  it('a period commits to the list with no day invented, and un-chooses today', async () => {
    const { deps, actions } = setup([createMockTask({ id: 'd', bucket: 'timed', scheduledFor: SAT, isAllDay: true, plannedOn: SAT })])
    await actions.drop({ kind: 'task', id: 'd', date: '2026-09-19', title: 'D' }, { type: 'period', period: 'week' })
    expect(deps.pushTask).toHaveBeenCalledWith('d', 'week')
    expect(deps.updateTask).toHaveBeenCalledWith('d', { plannedOn: undefined })
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
