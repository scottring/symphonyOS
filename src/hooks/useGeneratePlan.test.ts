import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useGeneratePlan } from './useGeneratePlan'

const invokeMock = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
  },
}))

beforeEach(() => { invokeMock.mockReset() })

const WEEK = new Date('2026-04-27T00:00:00')

describe('useGeneratePlan.generate', () => {
  it('invokes meal-plan-generate with weekStart and returns result', async () => {
    invokeMock.mockResolvedValueOnce({
      data: { insertedCount: 28, undoToken: { id: 't1', expiresAt: '...' }, notesForPlanner: 'ok', validationNotes: [] },
      error: null,
    })
    const { result } = renderHook(() => useGeneratePlan())
    let r: unknown
    await act(async () => { r = await result.current.generate(WEEK) })
    expect(invokeMock).toHaveBeenCalledWith('meal-plan-generate', { body: { weekStart: '2026-04-27' } })
    expect((r as { ok: boolean }).ok).toBe(true)
    await waitFor(() => expect(result.current.lastUndoToken?.id).toBe('t1'))
  })

  it('surfaces errors from the edge function', async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: { message: 'brief is empty' } })
    const { result } = renderHook(() => useGeneratePlan())
    let r: { ok: boolean; error?: string } = { ok: true }
    await act(async () => { r = await result.current.generate(WEEK) })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('brief is empty')
    expect(result.current.error).toContain('brief is empty')
  })

  it('toggles `generating` while in flight', async () => {
    let resolveFn: (v: unknown) => void = () => {}
    invokeMock.mockReturnValueOnce(new Promise(res => { resolveFn = res }))
    const { result } = renderHook(() => useGeneratePlan())
    act(() => { void result.current.generate(WEEK) })
    await waitFor(() => expect(result.current.generating).toBe(true))
    await act(async () => {
      resolveFn({ data: { insertedCount: 1, undoToken: null, notesForPlanner: '', validationNotes: [] }, error: null })
    })
    await waitFor(() => expect(result.current.generating).toBe(false))
  })
})

describe('useGeneratePlan.undo', () => {
  it('invokes meal-plan-undo with the token id', async () => {
    invokeMock.mockResolvedValueOnce({ data: { ok: true, noop: false }, error: null })
    const { result } = renderHook(() => useGeneratePlan())
    let r: unknown
    await act(async () => { r = await result.current.undo('t1') })
    expect(invokeMock).toHaveBeenCalledWith('meal-plan-undo', { body: { tokenId: 't1' } })
    expect((r as { ok: boolean }).ok).toBe(true)
  })
})
