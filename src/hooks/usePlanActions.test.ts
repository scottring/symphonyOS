import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { usePlanActions } from './usePlanActions'

const mocks = vi.hoisted(() => ({ updateTask: vi.fn().mockResolvedValue(true), pushTask: vi.fn().mockResolvedValue(true) }))
vi.mock('@/hooks/useSupabaseTasks', () => ({ useSupabaseTasks: () => ({
  tasks: [{ id: 'task', title: 'Month task' }], ...mocks, updateTasksBulk: vi.fn(), toggleTask: vi.fn(), deleteTask: vi.fn(),
}) }))
vi.mock('@/hooks/useGatedTaskActions', () => ({ useGatedTaskActions: (actions: unknown) => actions }))
vi.mock('@/hooks/useActionableInstances', () => ({ useActionableInstances: () => ({ setPlanned: vi.fn(), reschedule: vi.fn(), markDone: vi.fn(), undoDone: vi.fn() }) }))
vi.mock('@/hooks/useRoutines', () => ({ useRoutines: () => ({ routines: [], updateRoutine: vi.fn(), deleteRoutine: vi.fn() }) }))
vi.mock('@/hooks/useToast', () => ({ showToast: vi.fn() }))

describe('chooser week placement', () => {
  it('commits to the displayed week through the gated writer without dating the task or clearing its month', async () => {
    const week = new Date(2026, 9, 4)
    const { result } = renderHook(() => usePlanActions(undefined, week))
    await act(async () => { await result.current.commitTask('task', 'week') })
    expect(mocks.updateTask).toHaveBeenCalledWith('task', { bucket: 'week', weekStart: week })
    expect(mocks.pushTask).not.toHaveBeenCalled()
  })
})
