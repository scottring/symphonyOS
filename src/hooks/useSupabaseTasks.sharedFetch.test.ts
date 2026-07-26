import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useSupabaseTasks } from './useSupabaseTasks'

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
    }),
  },
}))

describe('useSupabaseTasks — one shared first load', () => {
  beforeEach(() => { selectCalls.mockClear() })

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

  it('an instance mounting AFTER the load still reads the database', async () => {
    // Sharing is limited to a request in flight. Nothing is cached, so a panel
    // opened later cannot be served rows that have since changed.
    const first = renderHook(() => useSupabaseTasks())
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    selectCalls.mockClear()

    const later = renderHook(() => useSupabaseTasks())
    await waitFor(() => expect(later.result.current.loading).toBe(false))

    expect(selectCalls).toHaveBeenCalledTimes(1)
  })

  it('refetch always goes back to the database', async () => {
    const { result } = renderHook(() => useSupabaseTasks())
    await waitFor(() => expect(result.current.loading).toBe(false))
    selectCalls.mockClear()

    await act(async () => { await result.current.refetch() })

    expect(selectCalls).toHaveBeenCalledTimes(1)
  })
})
