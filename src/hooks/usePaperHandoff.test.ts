import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const list = vi.fn()
vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: vi.fn(() => ({ list })) } },
  getAuthUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }),
}))

import { usePaperHandoff, HANDOFF_POLL_MS, HANDOFF_EXPIRES_MS } from './usePaperHandoff'

beforeEach(() => {
  vi.useFakeTimers()
  list.mockReset()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('usePaperHandoff', () => {
  it('polls the user page folder until the phone upload appears, then stops', async () => {
    list
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [{ name: 'handoff-abc.jpg' }], error: null })
    const { result } = renderHook(() => usePaperHandoff('abc'))
    expect(result.current.status).toBe('waiting')

    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(list).toHaveBeenCalledWith('u1/page', { search: 'handoff-abc.jpg' })
    expect(result.current.status).toBe('waiting')

    await act(async () => { await vi.advanceTimersByTimeAsync(HANDOFF_POLL_MS) })
    expect(result.current.status).toBe('received')
    expect(result.current.storagePath).toBe('u1/page/handoff-abc.jpg')

    await act(async () => { await vi.advanceTimersByTimeAsync(HANDOFF_POLL_MS * 3) })
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('does nothing without an id', async () => {
    renderHook(() => usePaperHandoff(null))
    await act(async () => { await vi.advanceTimersByTimeAsync(HANDOFF_POLL_MS * 2) })
    expect(list).not.toHaveBeenCalled()
  })

  it('gives up after the expiry window', async () => {
    list.mockResolvedValue({ data: [], error: null })
    const { result } = renderHook(() => usePaperHandoff('abc'))
    await act(async () => { await vi.advanceTimersByTimeAsync(HANDOFF_EXPIRES_MS + HANDOFF_POLL_MS) })
    expect(result.current.status).toBe('expired')
    const calls = list.mock.calls.length
    await act(async () => { await vi.advanceTimersByTimeAsync(HANDOFF_POLL_MS * 2) })
    expect(list.mock.calls.length).toBe(calls)
  })
})
