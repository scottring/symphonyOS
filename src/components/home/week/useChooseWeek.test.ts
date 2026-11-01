import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createMockTask } from '@/test/mocks/factories'
import type { FamilyMember } from '@/types/family'
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
const gate = createMockTask({ id: 'gate', title: 'Fix the gate', scheduledFor: new Date(2026, 9, 21), isAllDay: true, assignedTo: 'me' })

describe('useChooseWeek — Look back’s loose ends', () => {
  const setup = () => {
    const actions = { keepThisWeek: vi.fn(async () => true), letGo: vi.fn(async () => true), done: vi.fn(async () => true) } as unknown as DeckActions
    const updateTask = vi.fn(async () => true)
    const addTask = vi.fn(async () => 'new')
    const deps = {
      lines: [], pool: [gate], weekAnchor, lastWeekStart, monthStart: new Date(2026, 9, 1), isCurrent: true,
      actions, keepForward: vi.fn(), dropCommitment: vi.fn(), updateTask, addTask, deleteTask: vi.fn(),
    }
    const { result } = renderHook(() => useChooseWeek(deps))
    return { result, actions, updateTask, addTask }
  }

  it('each of last week’s not done comes with its four calls, bound to the page’s writers', async () => {
    const { result, actions, updateTask, addTask } = setup()
    expect(result.current.notDoneLastWeek).toBe(1)
    const [end] = result.current.looseEnds
    expect(end).toMatchObject({ key: 'gate', title: 'Fix the gate', who: ['me'] })
    await act(async () => { await end.thisWeek() })
    expect(actions.keepThisWeek).toHaveBeenCalledWith(expect.objectContaining({ task: gate, source: 'last-week' }))
    await act(async () => { await end.drop() })
    expect(actions.letGo).toHaveBeenCalledWith(expect.objectContaining({ task: gate, source: 'last-week' }))
    await act(async () => { await end.smaller('Buy a hinge') })
    expect(addTask).toHaveBeenCalledWith('Buy a hinge', undefined, undefined, undefined, expect.objectContaining({ bucket: 'week', weekStart: weekAnchor, sourceId: 'gate' }))
    runs.undo.length = 0
    await act(async () => { await end.handOff({ id: 'iris', name: 'Iris' } as FamilyMember) })
    expect(updateTask).toHaveBeenLastCalledWith('gate', { assignedTo: 'iris', assignedToAll: ['iris'] })
    expect(runs.labels).toContain('Hand “Fix the gate” to Iris')
    // Undo puts the people back as they were.
    await act(async () => { await runs.undo[0]() })
    expect(updateTask).toHaveBeenLastCalledWith('gate', { assignedTo: 'me', assignedToAll: undefined })
  })
})
