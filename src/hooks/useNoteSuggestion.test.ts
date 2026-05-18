import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useNoteSuggestion } from './useNoteSuggestion'

// Mock the supabase client
const invokeMock = vi.fn()
vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => invokeMock(...args),
    },
  },
}))

describe('useNoteSuggestion', () => {
  beforeEach(() => {
    invokeMock.mockReset()
  })

  it('fetches and returns suggestion data', async () => {
    invokeMock.mockResolvedValue({
      data: { best_match: { id: 'n1', confidence: 0.8 }, suggested_new_title: 'Bike storage ideas' },
      error: null,
    })
    const { result } = renderHook(() =>
      useNoteSuggestion({
        task: { id: 't1', title: 'Bike storage', notes: undefined },
        candidateNotes: [],
        domain: 'family',
        enabled: true,
      }),
    )
    await waitFor(() => expect(result.current.suggestion).not.toBeNull())
    expect(result.current.suggestion?.best_match?.id).toBe('n1')
    expect(result.current.suggestion?.suggested_new_title).toBe('Bike storage ideas')
    expect(result.current.loading).toBe(false)
  })

  it('returns fallback shape on edge function error', async () => {
    invokeMock.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const { result } = renderHook(() =>
      useNoteSuggestion({
        task: { id: 't2', title: 'X', notes: undefined },
        candidateNotes: [],
        domain: 'universal',
        enabled: true,
      }),
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.suggestion).toEqual({ best_match: null, suggested_new_title: 'X' })
  })

  it('does not call the function when enabled=false', () => {
    renderHook(() =>
      useNoteSuggestion({
        task: { id: 't3', title: 'X', notes: undefined },
        candidateNotes: [],
        domain: 'universal',
        enabled: false,
      }),
    )
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('caches per task.id within the session', async () => {
    invokeMock.mockResolvedValue({
      data: { best_match: null, suggested_new_title: 'T' },
      error: null,
    })
    const { rerender } = renderHook(
      ({ enabled }) =>
        useNoteSuggestion({
          task: { id: 't4', title: 'T', notes: undefined },
          candidateNotes: [],
          domain: 'family',
          enabled,
        }),
      { initialProps: { enabled: true } },
    )
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1))
    rerender({ enabled: false })
    rerender({ enabled: true })
    // Same task.id, should still be 1 call
    expect(invokeMock).toHaveBeenCalledTimes(1)
  })
})
