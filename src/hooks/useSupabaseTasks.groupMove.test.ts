import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useSupabaseTasks } from './useSupabaseTasks'

const mockUser = { id: 'test-user-id', email: 'test@example.com' }

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUser, loading: false }),
}))
vi.mock('@/hooks/useFamilyMembers', () => ({
  useFamilyMembers: () => ({
    members: [], loading: false, error: null,
    getCurrentUserMember: () => undefined,
    addMember: vi.fn(), updateMember: vi.fn(), deleteMember: vi.fn(),
  }),
}))
vi.mock('@/hooks/useToast', () => ({ useToast: () => ({ showToast: vi.fn() }) }))

interface MockDbTask {
  id: string
  user_id: string
  title: string
  completed: boolean
  bucket: string
  scheduled_for: string | null
  is_all_day: boolean | null
  parent_task_id: string | null
  created_at: string
  updated_at: string
}

const mockSupabaseData: MockDbTask[] = []
/** Every `.update(...).in('id', [...])` — the group-cascade write. */
const bulkWrites: Array<{ ids: string[]; data: Record<string, unknown> }> = []
/** Every `.update(...).eq('id', ...)` — a single-row write. */
const rowWrites: Array<{ id: string; data: Record<string, unknown> }> = []

function dbTask(over: Partial<MockDbTask> = {}): MockDbTask {
  return {
    id: 'task-x',
    user_id: 'test-user-id',
    title: 'Task',
    completed: false,
    bucket: 'timed',
    scheduled_for: '2026-07-24T09:00:00.000Z',
    is_all_day: false,
    parent_task_id: null,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
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
      update: (data: Record<string, unknown>) => ({
        eq: (_field: string, value: string) => {
          rowWrites.push({ id: value, data })
          return {
            select: () => Promise.resolve({
              data: [dbTask({ id: value })], error: null,
            }),
          }
        },
        in: (_field: string, values: string[]) => {
          bulkWrites.push({ ids: values, data })
          return Promise.resolve({ error: null })
        },
      }),
    }),
  },
}))

/** A group: a wrapper dated yesterday with two children dated yesterday. */
function seedGroup() {
  mockSupabaseData.push(
    dbTask({ id: 'yard', title: 'Yard optimization' }),
    dbTask({ id: 'weed', title: 'Weed and weedwhack the backyard', parent_task_id: 'yard' }),
    dbTask({ id: 'umbrella', title: 'Throw out the umbrella', parent_task_id: 'yard' }),
  )
}

describe('updateTask — a group moves as a unit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseData.length = 0
    bulkWrites.length = 0
    rowWrites.length = 0
  })

  it("carries the children when the parent's date changes", async () => {
    // Reported from real use: moving "Yard optimization" to All day today left
    // its two subtasks dated yesterday, where they stayed in the carried-over
    // list and read as belonging to an unrelated row.
    seedGroup()
    const { result } = renderHook(() => useSupabaseTasks())
    await waitFor(() => expect(result.current.loading).toBe(false))

    const today = new Date(2026, 6, 26)
    await act(async () => {
      await result.current.updateTask('yard', {
        scheduledFor: today, isAllDay: true, bucket: 'timed',
      })
    })

    expect(bulkWrites).toHaveLength(1)
    expect(bulkWrites[0].ids.sort()).toEqual(['umbrella', 'weed'])
    expect(bulkWrites[0].data.scheduled_for).toBe(today.toISOString())
    expect(bulkWrites[0].data.is_all_day).toBe(true)
    expect(bulkWrites[0].data.bucket).toBe('timed')
  })

  it('moves them in local state too, not just in the database', async () => {
    seedGroup()
    const { result } = renderHook(() => useSupabaseTasks())
    await waitFor(() => expect(result.current.loading).toBe(false))

    const today = new Date(2026, 6, 26)
    await act(async () => {
      await result.current.updateTask('yard', { scheduledFor: today, isAllDay: true })
    })

    const parent = result.current.tasks.find((t) => t.id === 'yard')
    expect(parent?.subtasks).toHaveLength(2)
    for (const child of parent!.subtasks!) {
      expect(child.scheduledFor).toEqual(today)
      expect(child.isAllDay).toBe(true)
    }
  })

  it('leaves the children alone when the edit is not a reschedule', async () => {
    // A rename, a context change, a completion — none of those are a move, and
    // rewriting a child's row for one would be an unasked-for side effect.
    seedGroup()
    const { result } = renderHook(() => useSupabaseTasks())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.updateTask('yard', { title: 'Yard work' })
    })

    expect(bulkWrites).toHaveLength(0)
  })

  it('does nothing extra for a childless task', async () => {
    mockSupabaseData.push(dbTask({ id: 'solo', title: 'Solo' }))
    const { result } = renderHook(() => useSupabaseTasks())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.updateTask('solo', { scheduledFor: new Date(2026, 6, 26) })
    })

    expect(bulkWrites).toHaveLength(0)
    expect(rowWrites.map((w) => w.id)).toEqual(['solo'])
  })
})
