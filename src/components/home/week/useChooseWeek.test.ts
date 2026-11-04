import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createMockTask } from '@/test/mocks/factories'
import type { DeckActions } from './useDeckActions'

const runs = vi.hoisted(() => ({ labels: [] as string[], undo: [] as (() => Promise<unknown>)[] }))
vi.mock('@/contexts/CanvasActivityContext', () => ({
  useCanvasActivity: () => ({
    run: async (label: string, write: () => Promise<boolean>, opts?: { undo?: () => Promise<unknown> }) => {
      runs.labels.push(label); if (opts?.undo) runs.undo.push(opts.undo)
      return write()
    },
  }),
}))

import { useChooseWeek } from './useChooseWeek'

const weekAnchor = new Date(2026, 9, 25)
const lastWeekStart = new Date(2026, 9, 18)
const gate = createMockTask({ id: 'gate', title: 'Fix the gate', scheduledFor: new Date(2026, 9, 21), isAllDay: true, assignedTo: 'me', context: 'family' })

describe('useChooseWeek — Look back’s loose ends', () => {
  const setup = (pool = [gate], lines: ReturnType<typeof createMockTask>[] = []) => {
    const actions = { keepThisWeek: vi.fn(async () => true), someday: vi.fn(async () => 'someday'), letGo: vi.fn(async () => true), done: vi.fn(async () => true) } as unknown as DeckActions
    const deps = { lines, pool, weekAnchor, lastWeekStart, monthStart: new Date(2026, 9, 1), isCurrent: true, actions }
    const { result } = renderHook(() => useChooseWeek(deps))
    return { result, actions, deps }
  }

  // A week leftover is Done, Next week, Someday or Let go (settled after the
  // builder check, 2026-11-04): nothing goes back up to the month.
  it('each of last week’s not done comes with its four calls, bound to the page’s writers', async () => {
    const { result, actions } = setup()
    expect(result.current.notDoneLastWeek).toBe(1)
    const [end] = result.current.looseEnds
    expect(end).toMatchObject({ key: 'gate', title: 'Fix the gate' })
    expect(Object.keys(end).sort()).toEqual(['done', 'key', 'letGo', 'nextWeek', 'note', 'someday', 'title'])
    await act(async () => { await end.nextWeek() })
    expect(actions.keepThisWeek).toHaveBeenCalledWith(expect.objectContaining({ task: gate, source: 'last-week' }))
    // Someday: last week's commitment only (the deck's Someday, which says what it did).
    await act(async () => { await end.someday() })
    expect(actions.someday).toHaveBeenCalledWith(expect.objectContaining({ task: gate, source: 'last-week' }))
    await act(async () => { await end.done() })
    expect(actions.done).toHaveBeenCalledWith(expect.objectContaining({ task: gate, source: 'last-week' }))
    // Let go: not ever (the deck's Let go, every list, with Undo).
    await act(async () => { await end.letGo() })
    expect(actions.letGo).toHaveBeenCalledWith(expect.objectContaining({ task: gate, source: 'last-week' }))
  })

  it('exposes no month destination: only the month’s lines to read, and four calls on a leftover that never go up', () => {
    const line = createMockTask({ id: 'L', title: 'Get the house ready', bucket: 'month', monthStart: new Date(2026, 9, 1) })
    const { result } = setup([gate, line], [line])
    expect(Object.keys(result.current).sort()).toEqual(['looseEnds', 'monthLines', 'monthWord', 'notDoneLastWeek', 'placeItems', 'placedCount'])
    expect(result.current.monthLines).toEqual([{ id: 'L', title: 'Get the house ready' }])
    expect(Object.keys(result.current.looseEnds![0]).sort()).toEqual(['done', 'key', 'letGo', 'nextWeek', 'note', 'someday', 'title'])
  })
})
