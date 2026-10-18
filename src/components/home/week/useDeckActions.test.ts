import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { Task } from '@/types/task'
import type { DeckCard } from '@/lib/planning/deck'
import { placementOf } from '@/lib/planning/placement'
import { lineDropUpdates } from '@/lib/planning/v2/planV2'
import { timingRemoval } from '@/lib/planning/planActions'

const runs: { label: string; undo?: () => Promise<boolean | void> }[] = []
const run = vi.fn(async (label: string, command: () => Promise<unknown>, opts?: { undo?: () => Promise<boolean | void> }) => {
  runs.push({ label, undo: opts?.undo })
  return (await command()) !== false
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
    await a.keepThisWeek(card('inbox', { bucket: 'inbox' }))
    expect(deps.gated.setBucket).toHaveBeenCalledWith('t1', 'week')
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

  it('later buckets go through applyTriageWhen; undo restores placementOf', async () => {
    const { deps, a } = setup()
    const c = card('inbox', { bucket: 'inbox' })
    await a.later(c, 'this-month')
    expect(deps.gated.setBucket).toHaveBeenCalledWith('t1', 'month')
    await a.later(c, 'someday')
    expect(deps.gated.setBucket).toHaveBeenCalledWith('t1', 'someday')
    await a.later(c, 'next-month')
    expect(deps.gated.pushTask).toHaveBeenCalled()
    await runs[0].undo!()
    expect(deps.onUpdateTask).toHaveBeenCalledWith('t1', placementOf(c.task))
  })

  it('laterOnDate pushes to the date', async () => {
    const { deps, a } = setup()
    const d = new Date(2026, 10, 3)
    await a.laterOnDate(card('inbox'), d)
    expect(deps.gated.pushTask).toHaveBeenCalledWith('t1', d)
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

  it('drain is one run, sets someday for each, undo restores placements', async () => {
    const { deps, a } = setup()
    const ts = [mk({ id: 'a' }), mk({ id: 'b', bucket: 'inbox' })]
    await a.drain(ts)
    expect(run).toHaveBeenCalledTimes(1)
    expect(runs[0].label).toBe('Move 2 untouched things to Later')
    expect(deps.gated.setBucket).toHaveBeenCalledWith('a', 'someday')
    expect(deps.gated.setBucket).toHaveBeenCalledWith('b', 'someday')
    await runs[0].undo!()
    expect(deps.onUpdateTask).toHaveBeenCalledWith('a', placementOf(ts[0]))
    expect(deps.onUpdateTask).toHaveBeenCalledWith('b', placementOf(ts[1]))
  })
})
