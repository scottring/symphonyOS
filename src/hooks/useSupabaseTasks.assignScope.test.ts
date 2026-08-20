import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useSupabaseTasks, __resetTasksCache } from './useSupabaseTasks'

// Assignment answers WHO DOES IT. Context answers WHAT PART OF LIFE this is.
// Scope answers WHO CAN SEE IT. The old auto-context rule collapsed all three:
// assigning a task to any household member stamped context='family', which
// then dragged scope to 'compound' via scopeForContextChange. Assigning a task
// to YOURSELF tripped it too — there was no self-exclusion — so Iris's own
// medical items ("Reschedule colo", "Call cvs re my clean out meds") became
// family-area and household-readable one tap after capture. 57 of her rows are
// in that state.
//
// What assignment actually requires is visibility for the assignee, which RLS
// grants on scope alone (2026-06-07_scope_axis.sql:35 — `scope IN
// ('couple','compound')`). 'couple' is the minimum that satisfies it, and it
// keeps the item off the kitchen wall, which needs compound.

const mockUser = { id: 'test-user-id', email: 'test@example.com' }

const ME = { id: 'member-me', name: 'Iris', user_id: 'test-user-id' }
const PARTNER = { id: 'member-partner', name: 'Scott', user_id: 'other-user-id' }

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUser, loading: false }),
}))
vi.mock('@/hooks/useFamilyMembers', () => ({
  useFamilyMembers: () => ({
    members: [ME, PARTNER], loading: false, error: null,
    getCurrentUserMember: () => ME,
    addMember: vi.fn(), updateMember: vi.fn(), deleteMember: vi.fn(),
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
  bucket: string
  scheduled_for: string | null
  is_all_day: boolean | null
  parent_task_id: string | null
  context: string | null
  scope: string
  assigned_to: string | null
  created_at: string
  updated_at: string
}

const mockSupabaseData: MockDbTask[] = []
/** Every `.update(...).eq('id', ...)` — the single-row write we assert on. */
const rowWrites: Array<{ id: string; data: Record<string, unknown> }> = []

function dbTask(over: Partial<MockDbTask> = {}): MockDbTask {
  return {
    id: 'task-x',
    user_id: 'test-user-id',
    title: 'Reschedule colo',
    completed: false,
    bucket: 'inbox',
    scheduled_for: null,
    is_all_day: false,
    parent_task_id: null,
    context: null,
    scope: 'individual',
    assigned_to: null,
    created_at: '2026-08-16T19:47:14Z',
    updated_at: '2026-08-16T19:47:14Z',
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
            select: () => Promise.resolve({ data: [dbTask({ id: value })], error: null }),
          }
        },
        in: () => Promise.resolve({ error: null }),
      }),
    }),
  },
}))

/** The write the hook actually sent for `id`. */
function writeFor(id: string): Record<string, unknown> {
  const write = rowWrites.find((w) => w.id === id)
  expect(write, `no row write for ${id}`).toBeDefined()
  return write!.data
}

describe('updateTask — assignment shares an item, it does not relabel it', () => {
  beforeEach(() => {
    __resetTasksCache()
    vi.clearAllMocks()
    mockSupabaseData.length = 0
    rowWrites.length = 0
  })

  it('leaves a private task private when you assign it to yourself', async () => {
    mockSupabaseData.push(dbTask({ id: 'colo' }))
    const { result } = renderHook(() => useSupabaseTasks())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.updateTask('colo', { assignedTo: ME.id })
    })

    const write = writeFor('colo')
    expect(write.assigned_to).toBe(ME.id)
    expect(write).not.toHaveProperty('context')
    expect(write).not.toHaveProperty('scope')
    expect(result.current.tasks.find((t) => t.id === 'colo')?.context).toBeNull()
  })

  it('shares with the assignee without changing the life area', async () => {
    mockSupabaseData.push(dbTask({ id: 'derm', title: 'Schedule derm', context: 'personal' }))
    const { result } = renderHook(() => useSupabaseTasks())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.updateTask('derm', { assignedTo: PARTNER.id })
    })

    const write = writeFor('derm')
    expect(write.assigned_to).toBe(PARTNER.id)
    expect(write.scope).toBe('couple')
    expect(write).not.toHaveProperty('context')
    expect(result.current.tasks.find((t) => t.id === 'derm')?.context).toBe('personal')
  })

  it('does not walk a household item back off the wall when it is reassigned', async () => {
    // Already compound (it belongs to the household and shows on the wall).
    // Handing it to someone must not narrow who can see it.
    mockSupabaseData.push(
      dbTask({ id: 'trash', title: 'Take out the trash', context: 'family', scope: 'compound' }),
    )
    const { result } = renderHook(() => useSupabaseTasks())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.updateTask('trash', { assignedTo: PARTNER.id })
    })

    const write = writeFor('trash')
    expect(write.assigned_to).toBe(PARTNER.id)
    expect(write).not.toHaveProperty('scope')
    expect(write).not.toHaveProperty('context')
  })

  it('still honours a context the caller set explicitly alongside the assignment', async () => {
    mockSupabaseData.push(dbTask({ id: 'baseball', title: 'Sign Kaleb up for baseball' }))
    const { result } = renderHook(() => useSupabaseTasks())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.updateTask('baseball', { assignedTo: PARTNER.id, context: 'family' })
    })

    const write = writeFor('baseball')
    expect(write.context).toBe('family')
    // context -> family still shares with the whole household, as it always has.
    expect(write.scope).toBe('compound')
  })

  it('clearing the assignee touches neither the life area nor the scope', async () => {
    mockSupabaseData.push(
      dbTask({ id: 'colo', assigned_to: PARTNER.id, scope: 'couple' }),
    )
    const { result } = renderHook(() => useSupabaseTasks())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.updateTask('colo', { assignedTo: null })
    })

    const write = writeFor('colo')
    expect(write.assigned_to).toBeNull()
    expect(write).not.toHaveProperty('context')
    expect(write).not.toHaveProperty('scope')
  })
})
