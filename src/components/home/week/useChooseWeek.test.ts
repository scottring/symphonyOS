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
  const setup = (pool = [gate], over: { dropCommitment?: () => Promise<boolean> } = {}) => {
    const actions = { keepThisWeek: vi.fn(async () => true), letGo: vi.fn(async () => true), done: vi.fn(async () => true) } as unknown as DeckActions
    const updateTask = vi.fn(async () => true)
    const addTask = vi.fn(async () => 'new')
    const deps = {
      lines: [], pool, weekAnchor, lastWeekStart, monthStart: new Date(2026, 9, 1), isCurrent: true,
      actions, keepForward: vi.fn(async () => 'kept'), dropCommitment: vi.fn(over.dropCommitment ?? (async () => true)), updateTask, addTask, deleteTask: vi.fn(async () => true),
    }
    const { result } = renderHook(() => useChooseWeek(deps))
    return { result, actions, updateTask, addTask, deps }
  }

  // A week leftover is Done, Next week, Someday or Let go (settled after the
  // builder check, 2026-11-04): nothing goes back up to the month.
  it('each of last week’s not done comes with its four calls, bound to the page’s writers', async () => {
    const { result, actions, updateTask } = setup()
    expect(result.current.notDoneLastWeek).toBe(1)
    const [end] = result.current.looseEnds
    expect(end).toMatchObject({ key: 'gate', title: 'Fix the gate' })
    expect(Object.keys(end).sort()).toEqual(['done', 'key', 'letGo', 'nextWeek', 'note', 'someday', 'title'])
    await act(async () => { await end.nextWeek() })
    expect(actions.keepThisWeek).toHaveBeenCalledWith(expect.objectContaining({ task: gate, source: 'last-week' }))
    // Someday: last week's commitment only (the deck's own let go of a week).
    await act(async () => { await end.someday() })
    expect(actions.letGo).toHaveBeenCalledWith(expect.objectContaining({ task: gate, source: 'last-week' }))
    await act(async () => { await end.done() })
    expect(actions.done).toHaveBeenCalledWith(expect.objectContaining({ task: gate, source: 'last-week' }))
    // Let go: not ever. Every list, and Undo puts it back.
    runs.undo.length = 0
    await act(async () => { await end.letGo() })
    expect(updateTask).toHaveBeenLastCalledWith('gate', { bucket: 'someday', dismissedAt: expect.any(Date) })
    expect(runs.labels).toContain('Let go: “Fix the gate”')
    await act(async () => { await runs.undo[0]() })
    expect(updateTask).toHaveBeenLastCalledWith('gate', expect.objectContaining({ dismissedAt: undefined }))
  })

  it('exposes no month destination: no Back to October, no This month or Next month, no step tied to a month line', () => {
    const line = createMockTask({ id: 'L', title: 'Get the house ready', bucket: 'month', monthStart: new Date(2026, 9, 1) })
    const inbox = createMockTask({ id: 'i', title: 'Book the vet', bucket: 'inbox' })
    const { result, addTask } = setup([gate, line, inbox])
    const labels = (verbs: { label: string; menu?: { label: string }[] }[]) => verbs.flatMap((v) => [v.label, ...(v.menu ?? []).map((m) => m.label)])
    const all = [
      ...result.current.lines.flatMap((l) => labels(l.verbs)),
      ...result.current.loose.flatMap((x) => labels(x.verbs)),
    ]
    expect(all.some((l) => /October|This month|Next month|Back to/.test(l))).toBe(false)
    // The month's lines are for reading: no verbs, no steps, nothing to add under them.
    expect(result.current.lines.every((l) => l.verbs.length === 0 && l.steps.length === 0 && !l.onAddStep)).toBe(true)
    expect('backTo' in result.current.looseEnds[0]).toBe(false)
    void result.current.onAddLoose('Call the plumber')
    expect(addTask).toHaveBeenCalledWith('Call the plumber', undefined, undefined, undefined, expect.not.objectContaining({ sourceId: expect.anything() }))
  })
})
