import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { Task } from '@/types/task'
import type { DeckCard } from '@/lib/planning/deck'
import { placementOf } from '@/lib/planning/placement'
import { lineDropUpdates } from '@/lib/planning/v2/planV2'
import { timingRemoval } from '@/lib/planning/planActions'

const runs: { label: string; undo?: () => Promise<boolean | void>; opts?: Record<string, unknown> }[] = []
const run = vi.fn(async (label: string, command: () => Promise<unknown>, opts?: { undo?: () => Promise<boolean | void> }) => {
  const ok = (await command()) !== false
  runs.push({ label, undo: opts?.undo, opts: opts as Record<string, unknown> })
  return ok
})
vi.mock('@/contexts/CanvasActivityContext', () => ({ useCanvasActivity: () => ({ run }) }))

import { useDeckActions } from './useDeckActions'

const weekAnchor = new Date(2026, 9, 12)
const lastWeekStart = new Date(2026, 9, 5)
const nextWeekStart = new Date(2026, 9, 19)

const mk = (over: Partial<Task> = {}): Task => ({ id: 't1', title: 'Fix gate', completed: false, createdAt: new Date(2026, 9, 1), bucket: 'week', ...over } as Task)
const card = (source: DeckCard['source'], over: Partial<Task> = {}): DeckCard => { const task = mk(over); return { key: task.id, task, source, facts: '' } }

function setup() {
  const deps = {
    toggleTask: vi.fn(async () => undefined),
    updateTask: vi.fn(async () => true),
    onUpdateTask: vi.fn(async () => true),
    keepForward: vi.fn(async (id: string) => id as string | undefined),
    gated: { pushTask: vi.fn(async () => true), setBucket: vi.fn(async () => true) },
    weekAnchor, lastWeekStart, nextWeekStart,
  }
  const { result } = renderHook(() => useDeckActions(deps))
  return { deps, a: result.current }
}

beforeEach(() => { runs.length = 0; run.mockClear() })

describe('useDeckActions', () => {
  it('done toggles; undo toggles again', async () => {
    const { deps, a } = setup()
    expect(await a.done(card('this-week'))).toBe(true)
    expect(deps.toggleTask).toHaveBeenCalledWith('t1')
    await runs[0].undo!()
    expect(deps.toggleTask).toHaveBeenCalledTimes(2)
  })

  it('placeOnDay for last-week: keepForward then the day patch; undo restores commitments', async () => {
    const { deps, a } = setup()
    const c = card('last-week')
    const day = new Date(2026, 9, 14)
    await a.placeOnDay(c, day)
    expect(deps.keepForward).toHaveBeenCalledWith('t1', { weekStart: weekAnchor }, lastWeekStart)
    expect(deps.onUpdateTask).toHaveBeenCalledWith('t1', lineDropUpdates(c.task, { kind: 'day', at: day }))
    await runs[0].undo!()
    expect(deps.updateTask).toHaveBeenCalledWith('t1', expect.objectContaining({ commitments: expect.any(Array) }))
  })

  it('placeOnDay for this-week/inbox: only the patch; undo restores patched keys', async () => {
    const { deps, a } = setup()
    const c = card('this-week')
    const day = new Date(2026, 9, 14)
    await a.placeOnDay(c, day)
    expect(deps.keepForward).not.toHaveBeenCalled()
    const patch = lineDropUpdates(c.task, { kind: 'day', at: day })
    expect(deps.onUpdateTask).toHaveBeenCalledWith('t1', patch)
    await runs[0].undo!()
    const before = Object.fromEntries(Object.keys(patch).map((k) => [k, c.task[k as keyof Task]]))
    expect(deps.onUpdateTask).toHaveBeenLastCalledWith('t1', before)
  })

  it('keepThisWeek: last-week keeps forward with no day; inbox sets the week bucket', async () => {
    const { deps, a } = setup()
    await a.keepThisWeek(card('last-week'))
    expect(deps.keepForward).toHaveBeenCalledWith('t1', { weekStart: weekAnchor }, lastWeekStart)
    deps.keepForward.mockClear()
    await a.keepThisWeek(card('inbox', { bucket: 'inbox' }))
    expect(deps.keepForward).toHaveBeenCalledWith('t1', { weekStart: weekAnchor })
    expect(deps.gated.setBucket).not.toHaveBeenCalled()
  })

  it('later next-week clears the day, keeps forward to next week; undo restores placement', async () => {
    const { deps, a } = setup()
    const c = card('this-week', { scheduledFor: new Date(2026, 9, 13) })
    await a.later(c, 'next-week')
    expect(deps.updateTask).toHaveBeenCalledWith('t1', timingRemoval(c.task, 'day').updates)
    expect(deps.keepForward).toHaveBeenCalledWith('t1', { weekStart: nextWeekStart }, weekAnchor)
    await runs[0].undo!()
    expect(deps.updateTask).toHaveBeenLastCalledWith('t1', expect.objectContaining({ commitments: expect.any(Array) }))
  })

  it('later next-week from last week uses lastWeekStart', async () => {
    const { deps, a } = setup()
    await a.later(card('last-week'), 'next-week')
    expect(deps.keepForward).toHaveBeenCalledWith('t1', { weekStart: nextWeekStart }, lastWeekStart)
  })

  const withMonth = (over: Partial<Task> = {}) => ({
    bucket: 'month', monthStart: new Date(2026, 9, 1),
    commitments: [{ id: 'c1', level: 'month', periodStart: new Date(2026, 9, 1), status: 'open' }],
    ...over,
  }) as Partial<Task>

  it.each([
    ['this-month', 'month'], ['this-season', 'quarter'], ['someday', 'someday'],
  ] as const)('later %s sets the bucket; undo restores commitments when the task has them', async (when, bucket) => {
    const { deps, a } = setup()
    const c = card('last-week', withMonth())
    await a.later(c, when)
    expect(deps.gated.setBucket).toHaveBeenCalledWith('t1', bucket)
    await runs[0].undo!()
    expect(deps.updateTask).toHaveBeenLastCalledWith('t1', expect.objectContaining({ commitments: expect.arrayContaining([expect.objectContaining({ level: 'month' })]) }))
  })

  it('later undo uses placementOf when the task has no live commitments', async () => {
    const { deps, a } = setup()
    const c = card('inbox', { bucket: 'inbox', commitments: [] })
    await a.later(c, 'someday')
    await runs[0].undo!()
    expect(deps.onUpdateTask).toHaveBeenCalledWith('t1', placementOf(c.task))
  })

  it('later next-month commits to the month via keepForward, no date on the 1st', async () => {
    const { deps, a } = setup()
    const c = card('this-week', withMonth())
    await a.later(c, 'next-month')
    const now = new Date()
    expect(deps.keepForward).toHaveBeenCalledWith('t1', { monthStart: new Date(now.getFullYear(), now.getMonth() + 1, 1) }, weekAnchor)
    expect(deps.gated.pushTask).not.toHaveBeenCalled()
    await runs[0].undo!()
    expect(deps.updateTask).toHaveBeenLastCalledWith('t1', expect.objectContaining({ commitments: expect.any(Array) }))
  })

  it('laterOnDate pushes to the date', async () => {
    const { deps, a } = setup()
    const d = new Date(2026, 10, 3)
    await a.laterOnDate(card('inbox'), d)
    expect(deps.gated.pushTask).toHaveBeenCalledWith('t1', d)
    await a.laterOnDate(card('this-week', withMonth()), d)
    await runs[1].undo!()
    expect(deps.updateTask).toHaveBeenLastCalledWith('t1', expect.objectContaining({ commitments: expect.any(Array) }))
  })

  it('letGo: week cards remove timing, inbox goes to someday', async () => {
    const { deps, a } = setup()
    const c = card('last-week')
    await a.letGo(c)
    const off = timingRemoval(c.task, 'all')
    expect(deps.updateTask).toHaveBeenCalledWith('t1', off.updates)
    await runs[0].undo!()
    expect(deps.updateTask).toHaveBeenLastCalledWith('t1', off.previous)
    await a.letGo(card('inbox', { bucket: 'inbox' }))
    expect(deps.gated.setBucket).toHaveBeenCalledWith('t1', 'someday')
  })

  it('drain: one run, ungated onUpdateTask, undo restores', async () => {
    const { deps, a } = setup()
    const ts = [mk({ id: 'a' }), mk({ id: 'b', bucket: 'inbox' }), mk({ id: 'c', ...withMonth() })]
    expect(await a.drain(ts)).toBe(true)
    expect(run).toHaveBeenCalledTimes(1)
    expect(runs[0].label).toBe('Move 3 untouched things to Later')
    for (const id of ['a', 'b', 'c']) expect(deps.onUpdateTask).toHaveBeenCalledWith(id, { bucket: 'someday' })
    expect(deps.gated.setBucket).not.toHaveBeenCalled()
    await runs[0].undo!()
    expect(deps.onUpdateTask).toHaveBeenCalledWith('a', placementOf(ts[0]))
    expect(deps.updateTask).toHaveBeenCalledWith('c', expect.objectContaining({ commitments: expect.any(Array) }))
  })

  it('drain takes the run\'s label when given one (the end of the deck)', async () => {
    const { a } = setup()
    expect(await a.drain([mk({ id: 'a' }), mk({ id: 'b' })], 'Move 2 left from last week to Later')).toBe(true)
    expect(run).toHaveBeenCalledTimes(1)
    expect(runs[0].label).toBe('Move 2 left from last week to Later')
  })

  it('drain with one failing write still succeeds; undo covers only the ones that wrote', async () => {
    const { deps, a } = setup()
    deps.onUpdateTask.mockImplementation(async (id: string) => id !== 'b')
    const ts = [mk({ id: 'a' }), mk({ id: 'b' }), mk({ id: 'c' })]
    expect(await a.drain(ts)).toBe(true)
    expect(runs[0].opts).toMatchObject({ failureSummary: "1 couldn't move" })
    deps.onUpdateTask.mockClear()
    await runs[0].undo!()
    const undone = deps.onUpdateTask.mock.calls.map((c) => c[0])
    expect(undone.sort()).toEqual(['a', 'c'])
  })

  it('drain where every write fails returns false', async () => {
    const { deps, a } = setup()
    deps.onUpdateTask.mockImplementation(async () => false)
    expect(await a.drain([mk({ id: 'a' })])).toBe(false)
  })
})
