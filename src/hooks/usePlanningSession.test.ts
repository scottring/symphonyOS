import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePlanningSession } from './usePlanningSession'
import { createMockUser } from '@/test/mocks/factories'

// Module-level state for mocking
const mockUser = createMockUser()
let mockUserState: ReturnType<typeof createMockUser> | null = mockUser
const mockUpsert = vi.fn()
const mockMaybeSingle = vi.fn()

// Mock useAuth
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUserState }),
}))

// Mock Supabase — select().eq().eq().eq().maybeSingle() for load,
// upsert() for persist. patchNotes doesn't depend on the load resolving
// (it's independent of `loading`), so tests don't need to await it.
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () => {
                mockMaybeSingle()
                return Promise.resolve({ data: null, error: null })
              },
            }),
          }),
        }),
      }),
      upsert: (data: unknown, options: unknown) => {
        mockUpsert(data, options)
        return Promise.resolve({ data: null, error: null })
      },
    }),
  },
}))

describe('usePlanningSession', () => {
  beforeEach(() => {
    mockUserState = mockUser
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces patchNotes and persists the merged notes after 600ms', () => {
    const { result } = renderHook(() => usePlanningSession('weekly', '2026-W28'))

    act(() => {
      result.current.patchNotes({ concerns: 'talk about budget' })
    })

    expect(mockUpsert).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(600)
    })

    expect(mockUpsert).toHaveBeenCalledTimes(1)
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        author_id: mockUser.id,
        horizon: 'weekly',
        period_token: '2026-W28',
        notes: expect.objectContaining({ concerns: 'talk about budget' }),
      }),
      expect.objectContaining({ onConflict: 'author_id,horizon,period_token' }),
    )
  })

  it('flushes a pending debounced write on unmount instead of discarding it', () => {
    const { result, unmount } = renderHook(() => usePlanningSession('weekly', '2026-W28'))

    // Mirrors GuidedSession.finish(): patchNotes({ stepIndex: 0 }) immediately
    // followed by an unmount (onClose), well inside the 600ms debounce window.
    act(() => {
      result.current.patchNotes({ stepIndex: 0 })
    })

    expect(mockUpsert).not.toHaveBeenCalled()

    act(() => {
      unmount()
    })

    // The flush fires synchronously in the cleanup (fire-and-forget upsert
    // call, not awaited) — no timer advance needed.
    expect(mockUpsert).toHaveBeenCalledTimes(1)
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        author_id: mockUser.id,
        horizon: 'weekly',
        period_token: '2026-W28',
        notes: expect.objectContaining({ stepIndex: 0 }),
      }),
      expect.objectContaining({ onConflict: 'author_id,horizon,period_token' }),
    )
  })

  it('merges multiple rapid patchNotes calls into a single flushed upsert on unmount', () => {
    const { result, unmount } = renderHook(() => usePlanningSession('annual', '2026'))

    act(() => {
      result.current.patchNotes({ concerns: 'shared concerns text' })
      result.current.patchNotes({ stepIndex: 0 })
    })

    act(() => {
      unmount()
    })

    expect(mockUpsert).toHaveBeenCalledTimes(1)
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        notes: expect.objectContaining({ concerns: 'shared concerns text', stepIndex: 0 }),
      }),
      expect.anything(),
    )
  })

  it('does not persist again on unmount once the debounced save already fired', () => {
    const { result, unmount } = renderHook(() => usePlanningSession('weekly', '2026-W28'))

    act(() => {
      result.current.patchNotes({ concerns: 'already saved' })
    })

    act(() => {
      vi.advanceTimersByTime(600)
    })

    expect(mockUpsert).toHaveBeenCalledTimes(1)

    act(() => {
      unmount()
    })

    expect(mockUpsert).toHaveBeenCalledTimes(1)
  })

  it('does not persist on unmount when nothing was ever patched', () => {
    const { unmount } = renderHook(() => usePlanningSession('weekly', '2026-W28'))

    act(() => {
      unmount()
    })

    expect(mockUpsert).not.toHaveBeenCalled()
  })
})
