import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useSupabaseTasks, __resetTasksCache } from './useSupabaseTasks'

// Scope answers WHO CAN SEE IT, and it is DERIVED — never chosen. Every task
// write recomputes it from the row's domain plus its assignees
// (scopeForDomain in src/lib/scope.ts):
//
//   family                       -> compound (the household layer)
//   handed to another member     -> couple   (the minimum RLS share)
//   otherwise                    -> individual
//
// Both halves matter. The old rule only ever widened: assigning a task stamped
// context='family' (with no self-exclusion, so assigning to YOURSELF tripped
// it) and a family row re-tagged private kept scope='compound'. That is how
// Iris's own medical items ("Reschedule colo") became household-readable one
// tap after capture, and how re-tagging a family task `personal` left the
// partner still able to read it — the August leak.
//
// RLS reads scope and nothing else (2026-06-07_scope_axis.sql:35 — `scope IN
// ('couple','compound')`), so these writes ARE the sharing decision.

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

describe('scope is derived from domain + assignees on every task write', () => {
  beforeEach(() => {
    __resetTasksCache()
    vi.clearAllMocks()
    mockSupabaseData.length = 0
    rowWrites.length = 0
  })

  it('assigning a private task to a partner shares it as couple', async () => {
    mockSupabaseData.push(dbTask({ context: 'personal', scope: 'individual' }))
    const { result } = renderHook(() => useSupabaseTasks())
    await waitFor(() => expect(result.current.tasks).toHaveLength(1))
    await act(() => result.current.updateTask('task-x', { assignedTo: PARTNER.id }))
    expect(rowWrites.at(-1)!.data).toMatchObject({ assigned_to: PARTNER.id, scope: 'couple' })
  })

  it('assigning to yourself changes nothing about sharing', async () => {
    mockSupabaseData.push(dbTask({ context: 'personal', scope: 'individual' }))
    const { result } = renderHook(() => useSupabaseTasks())
    await waitFor(() => expect(result.current.tasks).toHaveLength(1))
    await act(() => result.current.updateTask('task-x', { assignedTo: ME.id }))
    expect(rowWrites.at(-1)!.data.scope).toBe('individual')
  })

  it('un-assigning takes the share back', async () => {
    mockSupabaseData.push(dbTask({ context: 'personal', scope: 'couple', assigned_to: PARTNER.id }))
    const { result } = renderHook(() => useSupabaseTasks())
    await waitFor(() => expect(result.current.tasks).toHaveLength(1))
    await act(() => result.current.updateTask('task-x', { assignedTo: undefined, assignedToAll: undefined }))
    expect(rowWrites.at(-1)!.data.scope).toBe('individual')
  })

  it('re-tagging family -> personal on a compound row makes it private (the August leak)', async () => {
    mockSupabaseData.push(dbTask({ context: 'family', scope: 'compound' }))
    const { result } = renderHook(() => useSupabaseTasks())
    await waitFor(() => expect(result.current.tasks).toHaveLength(1))
    await act(() => result.current.updateTask('task-x', { context: 'personal' }))
    expect(rowWrites.at(-1)!.data).toMatchObject({ context: 'personal', scope: 'individual' })
  })

  it('tagging family shares with the household even if the caller passed a scope', async () => {
    mockSupabaseData.push(dbTask({ context: null, scope: 'individual' }))
    const { result } = renderHook(() => useSupabaseTasks())
    await waitFor(() => expect(result.current.tasks).toHaveLength(1))
    await act(() => result.current.updateTask('task-x', { context: 'family', scope: 'individual' }))
    expect(rowWrites.at(-1)!.data.scope).toBe('compound')
  })
})
