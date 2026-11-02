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

  it('each of last week’s not done comes with its four calls, bound to the page’s writers', async () => {
    const { result, actions, updateTask, addTask } = setup()
    expect(result.current.notDoneLastWeek).toBe(1)
    const [end] = result.current.looseEnds
    expect(end).toMatchObject({ key: 'gate', title: 'Fix the gate', who: ['me'], canHandOff: true })
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

  it('Smaller puts the step on this week and sends the bigger thing back to the month, with one Undo (walk 2026-11-02)', async () => {
    const { result, addTask, deps } = setup()
    const [end] = result.current.looseEnds
    expect(end.backTo).toBe('October')
    runs.undo.length = 0
    let saved = false
    await act(async () => { saved = await end.smaller('Buy a hinge') })
    expect(saved).toBe(true)
    expect(addTask).toHaveBeenCalledWith('Buy a hinge', undefined, undefined, undefined, expect.objectContaining({ bucket: 'week', weekStart: weekAnchor, sourceId: 'gate' }))
    // Off last week, onto October: not carried again as undone.
    expect(deps.keepForward).toHaveBeenCalledWith('gate', { monthStart: new Date(2026, 9, 1) })
    expect(deps.dropCommitment).toHaveBeenCalledWith('gate', 'week', lastWeekStart)
    expect(runs.undo).toHaveLength(1)
    const id = (addTask.mock.calls[0] as unknown[])[4] as { id: string }
    await act(async () => { await runs.undo[0]() })
    expect(deps.deleteTask).toHaveBeenCalledWith(id.id)
  })

  it('Smaller that can’t send the bigger thing back takes the new step away again and says it didn’t save', async () => {
    const { result, addTask, deps } = setup([gate], { dropCommitment: async () => false })
    let saved = true
    await act(async () => { saved = await result.current.looseEnds[0].smaller('Buy a hinge') })
    expect(saved).toBe(false)
    const id = (addTask.mock.calls[0] as unknown[])[4] as { id: string }
    expect(deps.deleteTask).toHaveBeenCalledWith(id.id)
  })

  it('only a Family loose end can be handed off: assigning a Personal, Work or untagged one would share it', () => {
    const own = (id: string, context?: 'personal' | 'work') => createMockTask({ id, title: id, scheduledFor: new Date(2026, 9, 21), isAllDay: true, context })
    const { result } = setup([gate, own('doctor', 'personal'), own('deck', 'work'), own('untagged')])
    expect(Object.fromEntries(result.current.looseEnds.map((e) => [e.key, e.canHandOff]))).toEqual({ gate: true, doctor: false, deck: false, untagged: false })
  })
})
