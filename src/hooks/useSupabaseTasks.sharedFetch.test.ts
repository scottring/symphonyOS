import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useSupabaseTasks, __resetTasksCache } from './useSupabaseTasks'

const mockUser = { id: 'test-user-id', email: 'test@example.com' }

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mockUser, loading: false }) }))
vi.mock('@/hooks/useFamilyMembers', () => ({
  useFamilyMembers: () => ({
    members: [], loading: false, error: null,
    getCurrentUserMember: () => undefined,
    addMember: vi.fn(), updateMember: vi.fn(), deleteMember: vi.fn(),
  }),
}))
vi.mock('@/hooks/useToast', () => ({ useToast: () => ({ showToast: vi.fn() }) }))

/** Counts trips to the tasks table. */
const selectCalls = vi.fn()
let resolveGate: (() => void) | null = null

const rows = [
  {
    id: 'a', user_id: 'test-user-id', title: 'One', completed: false, bucket: 'timed',
    scheduled_for: null, is_all_day: null, parent_task_id: null,
    created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
  },
]

vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel: vi.fn(() => {
      const ch: Record<string, unknown> = { on: vi.fn().mockReturnThis(), unsubscribe: vi.fn() }
      ch.subscribe = vi.fn(() => ch)
      return ch
    }),
    from: () => ({
      select: () => {
        selectCalls()
        const settle = async () => {
          // Hold the response open so a second mount lands mid-flight, which is
          // exactly how the real app mounts its instances.
          if (resolveGate) await new Promise<void>((r) => { const g = resolveGate!; resolveGate = null; queueMicrotask(() => { g(); r() }) })
          return { data: rows, error: null }
        }
        return { order: () => settle(), eq: () => ({ order: () => settle() }) }
      },
      update: (data: Record<string, unknown>) => ({
        eq: (_f: string, id: string) => ({
          select: () => Promise.resolve({ data: [{ ...rows[0], ...data, id }], error: null }),
        }),
      }),
    }),
  },
}))

describe('useSupabaseTasks — one shared first load', () => {
  beforeEach(() => {
    __resetTasksCache()
    selectCalls.mockClear()
  })

  it('two instances mounting together make ONE trip to the database', async () => {
    // Today mounts five of these. Each used to pull all 650 rows for itself.
    const first = renderHook(() => useSupabaseTasks())
    const second = renderHook(() => useSupabaseTasks())

    await waitFor(() => expect(first.result.current.loading).toBe(false))
    await waitFor(() => expect(second.result.current.loading).toBe(false))

    expect(selectCalls).toHaveBeenCalledTimes(1)
    expect(first.result.current.tasks).toHaveLength(1)
    expect(second.result.current.tasks).toHaveLength(1)
  })

  it('but they do not share task OBJECTS — one instance cannot mutate another', async () => {
    const first = renderHook(() => useSupabaseTasks())
    const second = renderHook(() => useSupabaseTasks())
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    await waitFor(() => expect(second.result.current.loading).toBe(false))

    expect(first.result.current.tasks[0]).not.toBe(second.result.current.tasks[0])
  })

  it('an instance mounting AFTER the load reads the cache, not the database', async () => {
    // In-flight sharing alone missed this: once the app got fast, the nine
    // instances on a route mounted far enough apart to each pull their own copy.
    const first = renderHook(() => useSupabaseTasks())
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    selectCalls.mockClear()

    const later = renderHook(() => useSupabaseTasks())
    await waitFor(() => expect(later.result.current.loading).toBe(false))

    expect(selectCalls).not.toHaveBeenCalled()
    expect(later.result.current.tasks).toHaveLength(1)
  })

  it('the cache is kept LIVE — a later instance sees a write it never witnessed', async () => {
    // This is what makes caching safe here: every write that reaches any
    // instance is applied to the cache by the same function, so an instance
    // mounting later is served current rows rather than a stale snapshot.
    const first = renderHook(() => useSupabaseTasks())
    await waitFor(() => expect(first.result.current.loading).toBe(false))

    await act(async () => {
      await first.result.current.updateTask('a', { title: 'Renamed' })
    })
    selectCalls.mockClear()

    const later = renderHook(() => useSupabaseTasks())
    await waitFor(() => expect(later.result.current.loading).toBe(false))

    expect(selectCalls).not.toHaveBeenCalled()
    expect(later.result.current.tasks[0].title).toBe('Renamed')
  })

  it('refetch always goes back to the database', async () => {
    const { result } = renderHook(() => useSupabaseTasks())
    await waitFor(() => expect(result.current.loading).toBe(false))
    selectCalls.mockClear()

    await act(async () => { await result.current.refetch() })

    expect(selectCalls).toHaveBeenCalledTimes(1)
  })
})
