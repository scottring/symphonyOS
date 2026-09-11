import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useSupabaseTasks, __resetTasksCache } from './useSupabaseTasks'

// Placing a month/season row LOWER copies it — the original stays on its list
// so the period's look-back sees the whole thing. But only the first placement
// copies. Re-place the same row (drag it to another day, drop it on another
// week, click the pool chip twice) and we move the copy it already made.
//
// Before this, every re-placement minted a row: ten identical "Maybe plan a
// block potluck on the porch" tasks landed inside twenty seconds on
// 2026-09-10, each carrying its own twin of the note.

const mockUser = { id: 'test-user-id', email: 'test@example.com' }

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mockUser, loading: false }) }))
vi.mock('@/hooks/useFamilyMembers', () => ({
  useFamilyMembers: () => ({
    members: [], loading: false, error: null,
    getCurrentUserMember: () => undefined,
    addMember: vi.fn(), updateMember: vi.fn(), deleteMember: vi.fn(),
  }),
}))
vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
  showToast: vi.fn(),
}))

const mockSupabaseData: Record<string, unknown>[] = []
const inserts: Record<string, unknown>[] = []
const rowWrites: Array<{ id: string; data: Record<string, unknown> }> = []

function dbTask(over: Record<string, unknown> = {}) {
  return {
    id: 'month-row',
    user_id: 'test-user-id',
    title: 'Maybe plan a block potluck on the porch',
    completed: false,
    bucket: 'month',
    scheduled_for: null,
    is_all_day: false,
    parent_task_id: null,
    context: 'family',
    scope: 'compound',
    assigned_to: null,
    source_id: null,
    notes: 'From the Aug 2026 family planning session.',
    created_at: '2026-08-06T09:22:15Z',
    updated_at: '2026-08-06T09:22:15Z',
    ...over,
  }
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel: vi.fn(() => {
      const ch: Record<string, unknown> = { on: vi.fn().mockReturnThis(), unsubscribe: vi.fn() }
      ch.subscribe = vi.fn(() => ch)
      return ch
    }),
    from: () => ({
      select: () => ({
        eq: () => ({ order: () => Promise.resolve({ data: mockSupabaseData, error: null }) }),
        order: () => Promise.resolve({ data: mockSupabaseData, error: null }),
      }),
      insert: (data: Record<string, unknown>) => {
        inserts.push(data)
        return {
          select: () => ({
            single: () => Promise.resolve({
              data: dbTask({ ...data, id: `copy-${inserts.length}` }),
              error: null,
            }),
          }),
        }
      },
      update: (data: Record<string, unknown>) => ({
        eq: (_field: string, value: string) => {
          rowWrites.push({ id: value, data })
          return { select: () => Promise.resolve({ data: [dbTask({ id: value })], error: null }) }
        },
        in: () => Promise.resolve({ error: null }),
      }),
    }),
  },
}))

describe('a month row is copied down once, then re-placed', () => {
  beforeEach(() => {
    __resetTasksCache()
    vi.clearAllMocks()
    mockSupabaseData.length = 0
    inserts.length = 0
    rowWrites.length = 0
  })

  it('the first placement copies, leaving the original alone', async () => {
    mockSupabaseData.push(dbTask())
    const { result } = renderHook(() => useSupabaseTasks())
    await waitFor(() => expect(result.current.tasks).toHaveLength(1))

    await act(() => result.current.updateTask('month-row', { bucket: 'week', weekStart: new Date(2026, 8, 13) }))

    expect(inserts).toHaveLength(1)
    expect(inserts[0]).toMatchObject({ source_id: 'month-row', bucket: 'week' })
    expect(rowWrites.filter((w) => w.id === 'month-row')).toHaveLength(0)
  })

  it('placing it again moves that copy instead of minting a second one', async () => {
    mockSupabaseData.push(dbTask())
    const { result } = renderHook(() => useSupabaseTasks())
    await waitFor(() => expect(result.current.tasks).toHaveLength(1))

    await act(() => result.current.updateTask('month-row', { bucket: 'week', weekStart: new Date(2026, 8, 13) }))
    await act(() => result.current.updateTask('month-row', { bucket: 'timed', scheduledFor: new Date(2026, 8, 12) }))

    expect(inserts).toHaveLength(1)
    const moved = rowWrites.at(-1)!
    expect(moved.id).toBe('copy-1')
    expect(moved.data).toMatchObject({ bucket: 'timed' })
  })

  it('a finished copy does not absorb the next placement', async () => {
    mockSupabaseData.push(
      dbTask(),
      dbTask({ id: 'done-copy', bucket: 'week', source_id: 'month-row', completed: true, created_at: '2026-09-01T10:00:00Z' }),
    )
    const { result } = renderHook(() => useSupabaseTasks())
    await waitFor(() => expect(result.current.tasks).toHaveLength(2))

    await act(() => result.current.updateTask('month-row', { bucket: 'week', weekStart: new Date(2026, 8, 20) }))

    expect(inserts).toHaveLength(1)
  })
})
