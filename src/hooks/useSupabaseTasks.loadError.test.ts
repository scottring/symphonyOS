import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useSupabaseTasks, __resetTasksCache } from './useSupabaseTasks'

// A failed read must reach EVERY instance. The first load is shared: the
// instance that starts it gets the error, and the ones that join mid-flight
// used to get an empty list and no error — so their page drew "Inbox zero" or
// "Nothing chosen yet." over a load that had failed.

const mockUser = { id: 'test-user-id', email: 'test@example.com' }
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mockUser, loading: false }) }))
vi.mock('@/hooks/useFamilyMembers', () => ({
  useFamilyMembers: () => ({ members: [], loading: false, error: null, getCurrentUserMember: () => undefined }),
}))
vi.mock('./useToast', () => ({ showToast: vi.fn() }))

const state = vi.hoisted(() => ({ fail: true }))
const rows = [{
  id: 'a', user_id: 'test-user-id', title: 'One', completed: false, bucket: 'inbox',
  scheduled_for: null, is_all_day: null, parent_task_id: null,
  created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
}]

vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel: vi.fn(() => {
      const ch: Record<string, unknown> = { on: vi.fn().mockReturnThis(), unsubscribe: vi.fn() }
      ch.subscribe = vi.fn(() => ch)
      return ch
    }),
    from: (table: string) => ({
      select: () => {
        const settle = async () => {
          await Promise.resolve()
          if (table === 'tasks' && state.fail) return { data: null, error: { message: 'Failed to fetch' } }
          return { data: table === 'tasks' ? rows : [], error: null }
        }
        return { order: () => settle(), then: (r: (v: unknown) => unknown) => settle().then(r) }
      },
    }),
  },
}))

describe('useSupabaseTasks — a failed first load', () => {
  beforeEach(() => {
    __resetTasksCache()
    state.fail = true
  })

  it('reports the error to every instance, not only the one that started the load', async () => {
    const first = renderHook(() => useSupabaseTasks())
    const second = renderHook(() => useSupabaseTasks())

    await waitFor(() => expect(first.result.current.loading).toBe(false))
    await waitFor(() => expect(second.result.current.loading).toBe(false))

    expect(first.result.current.tasks).toEqual([])
    expect(first.result.current.error).toBeTruthy()
    expect(second.result.current.tasks).toEqual([])
    expect(second.result.current.error).toBeTruthy()
  })

  it('refetch clears the error once the read succeeds', async () => {
    const { result } = renderHook(() => useSupabaseTasks())
    await waitFor(() => expect(result.current.error).toBeTruthy())

    state.fail = false
    await act(async () => { await result.current.refetch() })

    expect(result.current.error).toBeNull()
    expect(result.current.tasks).toHaveLength(1)
  })
})
