import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useSupabaseTasks, __resetTasksCache } from './useSupabaseTasks'

// Mock user for useAuth
const mockUser = { id: 'test-user-id', email: 'test@example.com' }

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUser, loading: false }),
}))

vi.mock('@/hooks/useFamilyMembers', () => ({
  useFamilyMembers: () => ({
    members: [],
    loading: false,
    error: null,
    getCurrentUserMember: () => undefined,
    addMember: vi.fn(),
    updateMember: vi.fn(),
    deleteMember: vi.fn(),
  }),
}))

vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
  showToast: vi.fn(),
}))

interface MockDbTask {
  id: string
  user_id: string
  title: string
  completed: boolean
  scheduled_for: string | null
  parent_task_id: string | null
  created_at: string
  updated_at: string
  [key: string]: unknown
}

function dbRow(overrides: Partial<MockDbTask> = {}): MockDbTask {
  return {
    id: 'row-id',
    user_id: 'test-user-id',
    title: 'Test Task',
    completed: false,
    scheduled_for: null,
    parent_task_id: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

const mockSupabaseData: MockDbTask[] = []

// Captured realtime handler, so tests can fire postgres_changes events.
type RealtimePayload = { eventType: string; new?: MockDbTask; old?: { id: string } }
let realtimeHandler: ((payload: RealtimePayload) => void) | null = null

// Deferred control over insert().select().single(), so tests can interleave
// the realtime INSERT with the in-flight insert response (the real-world race).
let resolveInsert: ((row: MockDbTask) => void) | null = null
let lastInsertPayload: Record<string, unknown> | null = null

vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel: vi.fn(() => {
      const ch: Record<string, unknown> = {
        on: vi.fn((_event: string, _filter: unknown, cb: (payload: RealtimePayload) => void) => {
          realtimeHandler = cb
          return ch
        }),
        unsubscribe: vi.fn(),
      }
      ch.subscribe = vi.fn(() => ch)
      return ch
    }),
    from: () => ({
      select: () => ({
        order: () => Promise.resolve({ data: mockSupabaseData, error: null }),
      }),
      insert: (data: Record<string, unknown>) => {
        lastInsertPayload = data
        return {
          select: () => ({
            single: () =>
              new Promise((res) => {
                resolveInsert = (row: MockDbTask) => res({ data: row, error: null })
              }),
          }),
        }
      },
      update: () => ({
        eq: () => Promise.resolve({ error: null }),
        in: () => Promise.resolve({ error: null }),
      }),
      delete: () => ({
        eq: () => Promise.resolve({ error: null }),
      }),
    }),
  },
}))

async function renderLoaded() {
  const rendered = renderHook(() => useSupabaseTasks())
  await waitFor(() => {
    expect(rendered.result.current.loading).toBe(false)
  })
  return rendered
}

describe('useSupabaseTasks - realtime dedup', () => {
  beforeEach(() => {
    __resetTasksCache()
    vi.clearAllMocks()
    mockSupabaseData.length = 0
    realtimeHandler = null
    resolveInsert = null
    lastInsertPayload = null
  })

  it('ignores a realtime INSERT for a task already in the list', async () => {
    mockSupabaseData.push(dbRow({ id: 'task-a', title: 'pick up meds from CVS' }))
    const { result } = await renderLoaded()
    expect(result.current.tasks).toHaveLength(1)

    act(() => {
      realtimeHandler!({ eventType: 'INSERT', new: dbRow({ id: 'task-a', title: 'pick up meds from CVS' }) })
    })

    expect(result.current.tasks).toHaveLength(1)
  })

  it('still adds a genuinely new task from a realtime INSERT', async () => {
    mockSupabaseData.push(dbRow({ id: 'task-a' }))
    const { result } = await renderLoaded()

    act(() => {
      realtimeHandler!({ eventType: 'INSERT', new: dbRow({ id: 'task-b', title: 'From another device' }) })
    })

    expect(result.current.tasks).toHaveLength(2)
    expect(result.current.tasks.map((t) => t.id)).toContain('task-b')
  })

  it('does not duplicate when the realtime INSERT lands before the insert response (addTask race)', async () => {
    const { result } = await renderLoaded()

    // Kick off addTask — optimistic temp task appears, insert stays pending.
    let addPromise: Promise<string | undefined>
    act(() => {
      addPromise = result.current.addTask('pick up meds from CVS')
    })
    await waitFor(() => expect(result.current.tasks).toHaveLength(1))
    const tempId = result.current.tasks[0].id

    // Realtime INSERT for the real row arrives first.
    const realRow = dbRow({ id: 'real-id', title: 'pick up meds from CVS' })
    act(() => {
      realtimeHandler!({ eventType: 'INSERT', new: realRow })
    })

    // Then the insert response resolves and swaps the temp task.
    await act(async () => {
      resolveInsert!(realRow)
      await addPromise!
    })

    const ids = result.current.tasks.map((t) => t.id)
    expect(ids).toEqual(['real-id'])
    expect(ids).not.toContain(tempId)
    expect(lastInsertPayload).not.toBeNull()
  })

  it('realtime INSERT of a subtask appends to the parent without dropping existing subtasks', async () => {
    mockSupabaseData.push(
      dbRow({ id: 'parent-1', title: 'Parent' }),
      dbRow({ id: 'sub-1', title: 'First subtask', parent_task_id: 'parent-1' })
    )
    const { result } = await renderLoaded()
    expect(result.current.tasks[0].subtasks).toHaveLength(1)

    act(() => {
      realtimeHandler!({ eventType: 'INSERT', new: dbRow({ id: 'sub-2', title: 'Second subtask', parent_task_id: 'parent-1' }) })
    })

    const parent = result.current.tasks.find((t) => t.id === 'parent-1')
    expect(parent?.subtasks?.map((s) => s.id)).toEqual(['sub-1', 'sub-2'])

    // And firing the same subtask INSERT again must not duplicate it.
    act(() => {
      realtimeHandler!({ eventType: 'INSERT', new: dbRow({ id: 'sub-2', title: 'Second subtask', parent_task_id: 'parent-1' }) })
    })
    expect(result.current.tasks.find((t) => t.id === 'parent-1')?.subtasks).toHaveLength(2)
  })

  it("realtime UPDATE of a parent keeps its nested subtasks (flat row must not strip them)", async () => {
    // Found live 2026-08-31: after any parent write, the realtime echo (a FLAT
    // row) replaced the parent object, wiping `subtasks`. The NEXT reschedule
    // of the parent then found no children to carry ("a group moves as a
    // unit"), stranding a scheduled child at a stale time.
    mockSupabaseData.push(
      dbRow({ id: 'parent-1', title: 'Parent' }),
      dbRow({ id: 'sub-1', title: 'Child', parent_task_id: 'parent-1' })
    )
    const { result } = await renderLoaded()
    expect(result.current.tasks.find((t) => t.id === 'parent-1')?.subtasks).toHaveLength(1)

    // The echo of a parent write: same row, flat, new title to prove the
    // update itself still applies.
    act(() => {
      realtimeHandler!({ eventType: 'UPDATE', new: dbRow({ id: 'parent-1', title: 'Parent renamed' }) })
    })

    const parent = result.current.tasks.find((t) => t.id === 'parent-1')
    expect(parent?.title).toBe('Parent renamed')
    expect(parent?.subtasks?.map((s) => s.id)).toEqual(['sub-1'])
  })
})
