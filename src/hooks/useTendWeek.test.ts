import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { Task } from '@/types/task'

const invoke = vi.fn()
vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}))

import { useTendWeek } from './useTendWeek'

function task(id: string, title: string, createdAt = new Date(2026, 6, 20)): Task {
  return { id, title, completed: false, createdAt, updatedAt: createdAt } as Task
}

const ARGS = {
  weekStartYmd: '2026-07-19',
  todayYmd: '2026-07-22',
  busy: [],
  projectNameFor: () => undefined,
}

beforeEach(() => invoke.mockReset())

describe('useTendWeek', () => {
  it('start() enters reviewing with prepass proposals immediately, then appends AI proposals', async () => {
    invoke.mockResolvedValue({ data: { proposals: [
      { kind: 'regrade', taskId: 'b', to: 'month', why: 'month-sized' },
    ] }, error: null })
    const pool = [task('a', 'Weed the backyard'), task('a2', 'Weed the backyard!'), task('b', 'Make a chore plan')]
    const { result } = renderHook(() => useTendWeek({ ...ARGS, pool, carryOver: [] }))

    act(() => result.current.start())
    expect(result.current.status).toBe('reviewing')
    expect(result.current.proposals.some((p) => p.kind === 'merge')).toBe(true) // prepass, sync

    await waitFor(() => expect(result.current.aiLoading).toBe(false))
    expect(result.current.proposals.some((p) => p.kind === 'regrade')).toBe(true)
    expect(result.current.aiError).toBeNull()
  })

  it('keeps prepass proposals and sets aiError when the edge fn fails', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('boom') })
    const pool = [task('a', 'Same title'), task('b', 'Same title')]
    const { result } = renderHook(() => useTendWeek({ ...ARGS, pool, carryOver: [] }))
    act(() => result.current.start())
    await waitFor(() => expect(result.current.aiLoading).toBe(false))
    expect(result.current.aiError).not.toBeNull()
    expect(result.current.proposals).toHaveLength(1)
    expect(result.current.status).toBe('reviewing')
  })

  it('drops AI proposals that target a task already covered by a same-kind pending proposal', async () => {
    invoke.mockResolvedValue({ data: { proposals: [
      { kind: 'merge', keepId: 'a', dropIds: ['b'], why: 'dupe (ai agrees)' },
    ] }, error: null })
    const pool = [task('a', 'Same title'), task('b', 'Same title')]
    const { result } = renderHook(() => useTendWeek({ ...ARGS, pool, carryOver: [] }))
    act(() => result.current.start())
    await waitFor(() => expect(result.current.aiLoading).toBe(false))
    expect(result.current.proposals.filter((p) => p.kind === 'merge')).toHaveLength(1)
  })

  it('remove() deletes one proposal; done() resets to idle', async () => {
    invoke.mockResolvedValue({ data: { proposals: [] }, error: null })
    const pool = [task('a', 'Same title'), task('b', 'Same title')]
    const { result } = renderHook(() => useTendWeek({ ...ARGS, pool, carryOver: [] }))
    act(() => result.current.start())
    const id = result.current.proposals[0].id
    act(() => result.current.remove(id))
    expect(result.current.proposals).toHaveLength(0)
    act(() => result.current.done())
    expect(result.current.status).toBe('idle')
  })
})
