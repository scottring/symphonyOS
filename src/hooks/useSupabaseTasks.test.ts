import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useSupabaseTasks, __resetTasksCache } from './useSupabaseTasks'
// The mocked client (see vi.mock below) — used by the test that pins down what
// the database does to a partial-row upsert.
import { supabase } from '@/lib/supabase'
import { resetIdCounter } from '@/test/mocks/factories'

// Mock user for useAuth
const mockUser = { id: 'test-user-id', email: 'test@example.com' }
let mockAuthUser: typeof mockUser | null = mockUser

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: mockAuthUser,
    loading: false,
  }),
}))

// useSupabaseTasks depends on useFamilyMembers (added after this suite was first
// written, which is why the suite had been skipped). The hook reads `members`
// and `getCurrentUserMember`, so a minimal mock keeps the suite focused on task
// CRUD and avoids useFamilyMembers' seed effect hitting the (unmocked)
// supabase.auth.getUser. An empty household means no assignment ever shares a
// row — the sharing rule itself is covered in useSupabaseTasks.assignScope.test.ts.
vi.mock('@/hooks/useFamilyMembers', () => ({
  useFamilyMembers: () => ({ members: [], getCurrentUserMember: () => undefined }),
}))

// Mock Supabase data storage - this needs to be in module scope for vi.mock
interface MockDbTask {
  id: string
  user_id: string
  title: string
  completed: boolean
  scheduled_for: string | null
  deferred_until: string | null
  defer_count: number | null
  is_all_day: boolean | null
  context: string | null
  notes: string | null
  links: unknown[] | null
  phone_number: string | null
  contact_id: string | null
  assigned_to: string | null
  project_id: string | null
  parent_task_id: string | null
  sort_order: number | null
  created_at: string
  updated_at: string
}

const mockSupabaseData: MockDbTask[] = []
let mockError: { message: string } | null = null

// Track calls
const mockUpdate = vi.fn()
const mockDelete = vi.fn()
const mockInsert = vi.fn()
const mockEq = vi.fn()
const mockIn = vi.fn()
const mockUpsert = vi.fn()
// update() and eq() are recorded separately, which loses the pairing when
// several updates are in flight at once (updateTaskOrders). This records the
// pair: (payload, filter field, filter value).
const mockUpdateEq = vi.fn()

// supabase-js normally RESOLVES `{ error }`, but a transport failure can reject
// the promise outright. Set this to make the next update() reject, so the
// rollback path for that case is actually exercised (Stage 2a residual 2).
let mockRejection: Error | null = null

// The `tasks` columns that are NOT NULL with no DEFAULT. Postgres rejects any
// proposed tuple missing them — including the tuple PostgREST builds for an
// `INSERT … ON CONFLICT DO UPDATE`, which it validates BEFORE probing for the
// conflict. Verified against production. Modelling this is the whole point of
// the checks below: a mock that accepts every payload is how a write the real
// database rejects outright passed as green.
const NOT_NULL_NO_DEFAULT = ['title', 'user_id'] as const

/** Returns a 23502 error object if `row` violates NOT NULL, else null. */
function notNullViolation(
  row: Record<string, unknown>,
  { insertShaped }: { insertShaped: boolean }
): { code: string; message: string; details: string } | null {
  for (const col of NOT_NULL_NO_DEFAULT) {
    // An INSERT-shaped write must SUPPLY the column (supabase-js sends absent
    // keys as explicit NULLs). An UPDATE only fails if it explicitly nulls it.
    const missing = insertShaped ? row[col] == null : col in row && row[col] == null
    if (missing) {
      return {
        code: '23502',
        message: `null value in column "${col}" violates not-null constraint`,
        details: `Failing row contains ${JSON.stringify(row)}.`,
      }
    }
  }
  return null
}

function createMockDbTask(overrides: Partial<MockDbTask> = {}): MockDbTask {
  return {
    id: `task-${Date.now()}-${Math.random()}`,
    user_id: 'test-user-id',
    title: 'Test Task',
    completed: false,
    scheduled_for: null,
    deferred_until: null,
    defer_count: null,
    is_all_day: null,
    context: null,
    notes: null,
    links: null,
    phone_number: null,
    contact_id: null,
    assigned_to: null,
    project_id: null,
    parent_task_id: null,
    sort_order: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: mockSupabaseData, error: mockError }),
        }),
        order: () => Promise.resolve({ data: mockSupabaseData, error: mockError }),
      }),
      insert: (data: Partial<MockDbTask>) => {
        mockInsert(data)
        const violation = notNullViolation(data as Record<string, unknown>, { insertShaped: true })
        const newTask = createMockDbTask({
          ...data,
          id: `new-${Date.now()}`,
        })
        return {
          select: () => ({
            single: () => {
              if (violation) {
                return Promise.resolve({ data: null, error: violation })
              }
              if (mockError) {
                return Promise.resolve({ data: null, error: mockError })
              }
              mockSupabaseData.push(newTask)
              return Promise.resolve({ data: newTask, error: null })
            },
          }),
        }
      },
      update: (data: Partial<MockDbTask>) => {
        mockUpdate(data)
        const violation = notNullViolation(data as Record<string, unknown>, { insertShaped: false })
        // updateTask() chains .eq().select() and reads { data, error }, while
        // toggleTask()/deleteTask()/updateTaskOrders() await .eq() directly for
        // { error }. Return a thenable that supports both shapes.
        return {
          eq: (field: string, value: string) => {
            mockEq(field, value)
            mockUpdateEq(data, field, value)
            const updated = mockSupabaseData.length ? [mockSupabaseData[0]] : [{}]
            const error = violation ?? mockError
            if (mockRejection) {
              const rejection = mockRejection
              return {
                select: () => Promise.reject(rejection),
                then: (
                  _resolve: (v: { error: typeof mockError }) => unknown,
                  reject?: (e: unknown) => unknown,
                ) => (reject ? reject(rejection) : undefined),
                catch: (reject: (e: unknown) => unknown) => reject(rejection),
              }
            }
            return {
              select: () => Promise.resolve({ data: updated, error, status: 200, count: updated.length }),
              then: (resolve: (v: { error: typeof mockError }) => unknown) =>
                resolve({ error }),
            }
          },
          in: (field: string, values: string[]) => {
            mockIn(field, values)
            // updateTasksBulk only awaits the promise, doesn't read select()
            return Promise.resolve({ error: violation ?? mockError })
          },
        }
      },
      delete: () => {
        mockDelete()
        return {
          eq: (field: string, value: string) => {
            mockEq(field, value)
            return Promise.resolve({ error: mockError })
          },
        }
      },
      // No production code path uses upsert on `tasks` — updateTaskOrders
      // deliberately does not (see its doc comment). Kept, and kept honest, so
      // that if anyone reaches for it again the test fails the way the database
      // would: INSERT … ON CONFLICT validates NOT NULL on the proposed tuple
      // first, so a partial `{ id, sort_order }` row is a 23502 even for an
      // existing row.
      upsert: (rows: Record<string, unknown>[], opts?: { onConflict?: string }) => {
        mockUpsert(rows, opts)
        for (const row of rows) {
          const violation = notNullViolation(row, { insertShaped: true })
          if (violation) return Promise.resolve({ error: violation })
        }
        return Promise.resolve({ error: mockError })
      },
    }),
    // Realtime subscription (added to the hook after this suite was written).
    // A no-op chainable channel keeps the subscribe effect from throwing.
    channel: () => {
      const channelMock = {
        on: () => channelMock,
        subscribe: () => channelMock,
        unsubscribe: () => {},
      }
      return channelMock
    },
  },
}))

describe('useSupabaseTasks', () => {
  beforeEach(() => {
    __resetTasksCache()
    vi.clearAllMocks()
    mockSupabaseData.length = 0
    mockError = null
    mockRejection = null
    mockAuthUser = mockUser
    resetIdCounter()
  })

  describe('initial loading', () => {
    it('fetches tasks on mount when user is authenticated', async () => {
      mockSupabaseData.push(
        createMockDbTask({ id: 'task-1', title: 'Task 1' }),
        createMockDbTask({ id: 'task-2', title: 'Task 2' })
      )

      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.tasks).toHaveLength(2)
      expect(result.current.tasks[0].title).toBe('Task 1')
      expect(result.current.tasks[1].title).toBe('Task 2')
    })

    it('sets loading to true while fetching', async () => {
      const { result } = renderHook(() => useSupabaseTasks())
      expect(result.current.loading).toBe(true)
      // Wait for async fetch to complete to avoid act() warning
      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })
    })

    it('sets loading to false after fetch completes', async () => {
      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })
    })

    it('handles fetch error gracefully', async () => {
      mockError = { message: 'Database error' }

      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.error).toBe('Database error')
      expect(result.current.tasks).toEqual([])
    })

    it('clears tasks when user is null', async () => {
      mockAuthUser = null

      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.tasks).toEqual([])
    })
  })

  describe('addTask', () => {
    it('creates task with just title', async () => {
      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      let newTaskId: string | undefined
      await act(async () => {
        newTaskId = await result.current.addTask('New Task')
      })

      expect(newTaskId).toBeDefined()
      expect(result.current.tasks.some(t => t.title === 'New Task')).toBe(true)
    })

    it('creates task with title and scheduledFor date', async () => {
      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      const scheduledDate = new Date('2024-06-15T10:00:00Z')

      await act(async () => {
        await result.current.addTask('Scheduled Task', undefined, undefined, scheduledDate)
      })

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Scheduled Task',
          scheduled_for: scheduledDate.toISOString(),
        })
      )
    })

    it('creates task with title and projectId', async () => {
      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.addTask('Project Task', undefined, 'project-123')
      })

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Project Task',
          project_id: 'project-123',
        })
      )
    })

    it('creates task with contactId', async () => {
      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.addTask('Contact Task', 'contact-123')
      })

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Contact Task',
          contact_id: 'contact-123',
        })
      )
    })

    it('returns the new task ID on success', async () => {
      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      let taskId: string | undefined
      await act(async () => {
        taskId = await result.current.addTask('New Task')
      })

      expect(taskId).toBeDefined()
      expect(typeof taskId).toBe('string')
    })

    it('returns undefined on failure', async () => {
      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      // Set error for the insert operation
      mockError = { message: 'Insert failed' }

      let taskId: string | undefined
      await act(async () => {
        taskId = await result.current.addTask('Failing Task')
      })

      expect(taskId).toBeUndefined()
    })

    it('passes phoneNumber through to the insert payload', async () => {
      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.addTask('Call Macmillan Guitars', 'c1', undefined, new Date(), {
          phoneNumber: '410-555-0142',
        })
      })

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          phone_number: '410-555-0142',
        })
      )
    })

    it('rolls back optimistic update on server error', async () => {
      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      const initialCount = result.current.tasks.length
      mockError = { message: 'Insert failed' }

      await act(async () => {
        await result.current.addTask('Failing Task')
      })

      // Task should be rolled back
      expect(result.current.tasks.length).toBe(initialCount)
    })
  })

  describe('updateTask', () => {
    it('updates task title', async () => {
      mockSupabaseData.push(createMockDbTask({ id: 'task-1', title: 'Original Title' }))

      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.tasks).toHaveLength(1)
      })

      await act(async () => {
        await result.current.updateTask('task-1', { title: 'Updated Title' })
      })

      expect(result.current.tasks[0].title).toBe('Updated Title')
      expect(mockUpdate).toHaveBeenCalledWith({ title: 'Updated Title' })
    })

    it('pushTask increments defer_count from zero', async () => {
      mockSupabaseData.push(createMockDbTask({ id: 'task-1', title: 'Task', defer_count: null }))

      const { result } = renderHook(() => useSupabaseTasks())
      await waitFor(() => {
        expect(result.current.tasks).toHaveLength(1)
      })

      await act(async () => {
        await result.current.pushTask('task-1', 'week')
      })

      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ defer_count: 1 }))
    })

    it('pushTask increments from an existing count rather than resetting', async () => {
      mockSupabaseData.push(createMockDbTask({ id: 'task-1', title: 'Task', defer_count: 4 }))

      const { result } = renderHook(() => useSupabaseTasks())
      await waitFor(() => {
        expect(result.current.tasks).toHaveLength(1)
      })

      await act(async () => {
        await result.current.pushTask('task-1', new Date('2026-09-01T09:00:00'))
      })

      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ defer_count: 5 }))
    })

    it('updates task scheduledFor', async () => {
      mockSupabaseData.push(createMockDbTask({ id: 'task-1', title: 'Task' }))

      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.tasks).toHaveLength(1)
      })

      const newDate = new Date('2024-06-20T14:00:00Z')

      await act(async () => {
        await result.current.updateTask('task-1', { scheduledFor: newDate })
      })

      expect(result.current.tasks[0].scheduledFor).toEqual(newDate)
      // Setting a date implies bucket 'timed' (scheduledFor is documented as
      // "only set when bucket='timed'") — without it the task would be dated
      // but absent from every day view.
      expect(mockUpdate).toHaveBeenCalledWith({ scheduled_for: newDate.toISOString(), bucket: 'timed' })
    })

    it("clearing the date on a timed task returns it to the inbox (never bucket 'timed' with no date)", async () => {
      mockSupabaseData.push(createMockDbTask({ id: 'task-1', title: 'Task', bucket: 'timed', scheduled_for: '2024-06-20T14:00:00Z' } as any))

      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.tasks).toHaveLength(1)
      })

      await act(async () => {
        await result.current.updateTask('task-1', { bucket: 'timed', scheduledFor: undefined, isAllDay: false })
      })

      // A 'timed' task without a date is invisible to both the timed pool and
      // the inbox pool — the clear must re-bucket to inbox.
      expect(result.current.tasks[0].bucket).toBe('inbox')
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ bucket: 'inbox', scheduled_for: null, is_all_day: false })
      )
    })

    it('keeps an explicit bucket when a date is set alongside it', async () => {
      mockSupabaseData.push(createMockDbTask({ id: 'task-1', title: 'Task' }))

      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.tasks).toHaveLength(1)
      })

      const newDate = new Date('2024-06-21T09:00:00Z')
      await act(async () => {
        await result.current.updateTask('task-1', { bucket: 'timed', scheduledFor: newDate, isAllDay: false })
      })

      expect(result.current.tasks[0].bucket).toBe('timed')
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ bucket: 'timed', scheduled_for: newDate.toISOString() })
      )
    })

    it('updates task notes', async () => {
      mockSupabaseData.push(createMockDbTask({ id: 'task-1', title: 'Task' }))

      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.tasks).toHaveLength(1)
      })

      await act(async () => {
        await result.current.updateTask('task-1', { notes: 'Some notes here' })
      })

      expect(result.current.tasks[0].notes).toBe('Some notes here')
      expect(mockUpdate).toHaveBeenCalledWith({ notes: 'Some notes here' })
    })

    it('updates task projectId', async () => {
      mockSupabaseData.push(createMockDbTask({ id: 'task-1', title: 'Task' }))

      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.tasks).toHaveLength(1)
      })

      await act(async () => {
        await result.current.updateTask('task-1', { projectId: 'project-456' })
      })

      expect(result.current.tasks[0].projectId).toBe('project-456')
      expect(mockUpdate).toHaveBeenCalledWith({ project_id: 'project-456' })
    })

    it('updates task contactId', async () => {
      mockSupabaseData.push(createMockDbTask({ id: 'task-1', title: 'Task' }))

      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.tasks).toHaveLength(1)
      })

      await act(async () => {
        await result.current.updateTask('task-1', { contactId: 'contact-789' })
      })

      expect(result.current.tasks[0].contactId).toBe('contact-789')
      expect(mockUpdate).toHaveBeenCalledWith({ contact_id: 'contact-789' })
    })

    it('updates task assignedTo', async () => {
      mockSupabaseData.push(createMockDbTask({ id: 'task-1', title: 'Task' }))

      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.tasks).toHaveLength(1)
      })

      await act(async () => {
        await result.current.updateTask('task-1', { assignedTo: 'family-member-1' })
      })

      expect(result.current.tasks[0].assignedTo).toBe('family-member-1')
      // Scope rides along, derived: handing an untagged task to someone who is
      // not you shares it with them (scopeForDomain -> 'couple').
      expect(mockUpdate).toHaveBeenCalledWith({
        assigned_to: 'family-member-1',
        scope: 'couple',
      })
    })

    it('updates multiple fields at once', async () => {
      mockSupabaseData.push(createMockDbTask({ id: 'task-1', title: 'Task' }))

      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.tasks).toHaveLength(1)
      })

      await act(async () => {
        await result.current.updateTask('task-1', {
          title: 'New Title',
          notes: 'New notes',
          context: 'work',
        })
      })

      expect(result.current.tasks[0].title).toBe('New Title')
      expect(result.current.tasks[0].notes).toBe('New notes')
      expect(result.current.tasks[0].context).toBe('work')
    })

    it('handles updating non-existent task', async () => {
      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      // Should not throw
      await act(async () => {
        await result.current.updateTask('non-existent', { title: 'Test' })
      })

      // Update should not be called for non-existent task
      expect(mockUpdate).not.toHaveBeenCalled()
    })

    it('writes sortOrder: 0 as sort_order: 0, not null', async () => {
      mockSupabaseData.push(createMockDbTask({ id: 'task-1', title: 'Task' }))

      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.tasks).toHaveLength(1)
      })

      await act(async () => {
        await result.current.updateTask('task-1', { sortOrder: 0 })
      })

      // Explicitly check that sort_order is 0, not null or undefined
      expect(mockUpdate).toHaveBeenCalledWith({ sort_order: 0 })
      expect(result.current.tasks[0].sortOrder).toBe(0)
    })

    it('writes sortOrder: null as sort_order: null, not 0', async () => {
      mockSupabaseData.push(createMockDbTask({ id: 'task-1', title: 'Task' }))

      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.tasks).toHaveLength(1)
      })

      await act(async () => {
        await result.current.updateTask('task-1', { sortOrder: null })
      })

      // Explicitly check that sort_order is null, not 0
      expect(mockUpdate).toHaveBeenCalledWith({ sort_order: null })
      expect(result.current.tasks[0].sortOrder).toBeNull()
    })

    it('omits sort_order from updates that do not mention sortOrder', async () => {
      mockSupabaseData.push(createMockDbTask({ id: 'task-1', title: 'Original' }))

      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.tasks).toHaveLength(1)
      })

      await act(async () => {
        await result.current.updateTask('task-1', { title: 'Updated' })
      })

      // sort_order should not be in the update payload at all
      expect(mockUpdate).toHaveBeenCalledWith({ title: 'Updated' })
      const lastCall = mockUpdate.mock.calls[mockUpdate.mock.calls.length - 1][0]
      expect(lastCall).not.toHaveProperty('sort_order')
    })

    it('rolls back on server error', async () => {
      mockSupabaseData.push(createMockDbTask({ id: 'task-1', title: 'Original' }))

      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.tasks).toHaveLength(1)
      })

      mockError = { message: 'Update failed' }

      await act(async () => {
        await result.current.updateTask('task-1', { title: 'Will Fail' })
      })

      // Should roll back to original
      expect(result.current.tasks[0].title).toBe('Original')
    })
  })

  describe('updateTasksBulk', () => {
    it('writes sortOrder: 0 as sort_order: 0, not null', async () => {
      mockSupabaseData.push(
        createMockDbTask({ id: 'task-1', title: 'Task 1' }),
        createMockDbTask({ id: 'task-2', title: 'Task 2' })
      )

      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.tasks).toHaveLength(2)
      })

      await act(async () => {
        await result.current.updateTasksBulk(['task-1', 'task-2'], { sortOrder: 0 })
      })

      // Explicitly check that sort_order is 0, not null or undefined
      expect(mockUpdate).toHaveBeenCalledWith({ sort_order: 0 })
      expect(result.current.tasks.find(t => t.id === 'task-1')?.sortOrder).toBe(0)
      expect(result.current.tasks.find(t => t.id === 'task-2')?.sortOrder).toBe(0)
    })

    it('writes sortOrder: null as sort_order: null, not 0', async () => {
      mockSupabaseData.push(
        createMockDbTask({ id: 'task-1', title: 'Task 1' }),
        createMockDbTask({ id: 'task-2', title: 'Task 2' })
      )

      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.tasks).toHaveLength(2)
      })

      await act(async () => {
        await result.current.updateTasksBulk(['task-1', 'task-2'], { sortOrder: null })
      })

      // Explicitly check that sort_order is null, not 0
      expect(mockUpdate).toHaveBeenCalledWith({ sort_order: null })
      expect(result.current.tasks.find(t => t.id === 'task-1')?.sortOrder).toBeNull()
      expect(result.current.tasks.find(t => t.id === 'task-2')?.sortOrder).toBeNull()
    })

    it('omits sort_order from updates that do not mention sortOrder', async () => {
      mockSupabaseData.push(
        createMockDbTask({ id: 'task-1', title: 'Task 1' }),
        createMockDbTask({ id: 'task-2', title: 'Task 2' })
      )

      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.tasks).toHaveLength(2)
      })

      await act(async () => {
        await result.current.updateTasksBulk(['task-1', 'task-2'], { completed: true })
      })

      // sort_order should not be in the update payload at all
      expect(mockUpdate).toHaveBeenCalledWith({ completed: true })
      const lastCall = mockUpdate.mock.calls[mockUpdate.mock.calls.length - 1][0]
      expect(lastCall).not.toHaveProperty('sort_order')
    })
  })

  describe('updateTaskOrders', () => {
    it('updateTaskOrders applies a different sortOrder per task, optimistically', async () => {
      mockSupabaseData.push(
        createMockDbTask({ id: 't1', sort_order: null }),
        createMockDbTask({ id: 't2', sort_order: null })
      )
      const { result } = renderHook(() => useSupabaseTasks())
      await waitFor(() => {
        expect(result.current.tasks).toHaveLength(2)
      })

      await act(async () => {
        await result.current.updateTaskOrders([
          { id: 't1', sortOrder: 0 },
          { id: 't2', sortOrder: 1000 },
        ])
      })

      const t1 = result.current.tasks.find(t => t.id === 't1')
      const t2 = result.current.tasks.find(t => t.id === 't2')
      expect(t1?.sortOrder).toBe(0)
      expect(t2?.sortOrder).toBe(1000)
    })

    it('writes only sort_order, scoped by id, and never as an upsert', async () => {
      mockSupabaseData.push(
        createMockDbTask({ id: 't1', sort_order: null }),
        createMockDbTask({ id: 't2', sort_order: null })
      )
      const { result } = renderHook(() => useSupabaseTasks())
      await waitFor(() => {
        expect(result.current.tasks).toHaveLength(2)
      })

      await act(async () => {
        await result.current.updateTaskOrders([
          { id: 't1', sortOrder: 0 },
          { id: 't2', sortOrder: 1000 },
        ])
      })

      // Never an upsert: PostgREST would compile it to INSERT … ON CONFLICT,
      // and Postgres validates the proposed tuple's NOT NULL columns (title,
      // user_id — both without defaults) before it looks for the conflict, so
      // a partial row is rejected with 23502 even though the row exists.
      expect(mockUpsert).not.toHaveBeenCalled()

      // One narrow UPDATE per row: payload is exactly { sort_order }, filtered
      // by that row's id. Nothing here can be read as an insert.
      expect(mockUpdateEq).toHaveBeenCalledTimes(2)
      expect(mockUpdateEq).toHaveBeenCalledWith({ sort_order: 0 }, 'id', 't1')
      expect(mockUpdateEq).toHaveBeenCalledWith({ sort_order: 1000 }, 'id', 't2')
      for (const [payload] of mockUpdateEq.mock.calls) {
        expect(Object.keys(payload)).toEqual(['sort_order'])
      }
    })

    it('resolves true when every row persists', async () => {
      mockSupabaseData.push(createMockDbTask({ id: 't1', sort_order: null }))
      const { result } = renderHook(() => useSupabaseTasks())
      await waitFor(() => {
        expect(result.current.tasks).toHaveLength(1)
      })

      let ok: boolean | undefined
      await act(async () => {
        ok = await result.current.updateTaskOrders([{ id: 't1', sortOrder: 0 }])
      })
      expect(ok).toBe(true)
    })

    it('rolls back and reports when a query REJECTS rather than resolving', async () => {
      // Stage 2a residual 2: Promise.all had no catch. supabase-js normally
      // resolves { error }, but a rejection would escape with the optimistic
      // order still applied — the list would show an order the database never
      // took, and no toast would say so.
      mockRejection = new Error('network')
      const { result } = renderHook(() => useSupabaseTasks())
      await waitFor(() => expect(result.current.loading).toBe(false))
      let ok: boolean | undefined
      await act(async () => {
        ok = await result.current.updateTaskOrders([{ id: 't1', sortOrder: 500 }])
      })
      expect(ok).toBe(false)
    })

    it('updateTaskOrders is a no-op for an empty list', async () => {
      const { result } = renderHook(() => useSupabaseTasks())
      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.updateTaskOrders([])
      })

      expect(mockUpsert).not.toHaveBeenCalled()
      expect(mockUpdate).not.toHaveBeenCalled()
    })

    it('updates a nested subtask optimistically (group members live one level down)', async () => {
      mockSupabaseData.push(
        createMockDbTask({ id: 'group', sort_order: 0 }),
        createMockDbTask({ id: 'member', parent_task_id: 'group', sort_order: 1000 })
      )
      const { result } = renderHook(() => useSupabaseTasks())
      await waitFor(() => {
        // nestSubtasks lifts 'member' out of the top level
        expect(result.current.tasks).toHaveLength(1)
      })

      await act(async () => {
        await result.current.updateTaskOrders([{ id: 'member', sortOrder: 7000 }])
      })

      expect(result.current.tasks[0].subtasks?.[0].sortOrder).toBe(7000)
      expect(mockUpdateEq).toHaveBeenCalledWith({ sort_order: 7000 }, 'id', 'member')
    })

    it('rolls a nested subtask back on server error', async () => {
      mockSupabaseData.push(
        createMockDbTask({ id: 'group', sort_order: 0 }),
        createMockDbTask({ id: 'member', parent_task_id: 'group', sort_order: 1000 })
      )
      const { result } = renderHook(() => useSupabaseTasks())
      await waitFor(() => {
        expect(result.current.tasks).toHaveLength(1)
      })

      mockError = { message: 'Update failed' }

      let ok: boolean | undefined
      await act(async () => {
        ok = await result.current.updateTaskOrders([{ id: 'member', sortOrder: 7000 }])
      })

      expect(result.current.tasks[0].subtasks?.[0].sortOrder).toBe(1000)
      expect(ok).toBe(false)
    })

    it('a partial-row upsert of the same payload would be rejected by the database', async () => {
      // Guards the reasoning behind the per-row UPDATE above: this is what the
      // old implementation sent, and what Postgres does with it.
      const { error } = await (
        supabase.from('tasks') as unknown as {
          upsert: (
            rows: Record<string, unknown>[],
            opts: { onConflict: string }
          ) => Promise<{ error: { code?: string; message: string } | null }>
        }
      ).upsert([{ id: 't1', sort_order: 0 }], { onConflict: 'id' })

      expect(error?.code).toBe('23502')
      expect(error?.message).toContain('not-null constraint')
    })

    it('rolls back to the previous sortOrder on server error', async () => {
      mockSupabaseData.push(
        createMockDbTask({ id: 't1', sort_order: 5 }),
        createMockDbTask({ id: 't2', sort_order: 10 })
      )
      const { result } = renderHook(() => useSupabaseTasks())
      await waitFor(() => {
        expect(result.current.tasks).toHaveLength(2)
      })

      mockError = { message: 'Update failed' }

      let ok: boolean | undefined
      await act(async () => {
        ok = await result.current.updateTaskOrders([
          { id: 't1', sortOrder: 0 },
          { id: 't2', sortOrder: 1000 },
        ])
      })

      const t1 = result.current.tasks.find(t => t.id === 't1')
      const t2 = result.current.tasks.find(t => t.id === 't2')
      expect(t1?.sortOrder).toBe(5)
      expect(t2?.sortOrder).toBe(10)
      expect(ok).toBe(false)
    })
  })

  describe('toggleTask', () => {
    it('marks incomplete task as complete', async () => {
      mockSupabaseData.push(createMockDbTask({ id: 'task-1', title: 'Task', completed: false }))

      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.tasks).toHaveLength(1)
      })

      await act(async () => {
        await result.current.toggleTask('task-1')
      })

      expect(result.current.tasks[0].completed).toBe(true)
      expect(mockUpdate).toHaveBeenCalledWith({ completed: true })
    })

    it('marks complete task as incomplete', async () => {
      mockSupabaseData.push(createMockDbTask({ id: 'task-1', title: 'Task', completed: true }))

      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.tasks).toHaveLength(1)
      })

      await act(async () => {
        await result.current.toggleTask('task-1')
      })

      expect(result.current.tasks[0].completed).toBe(false)
      expect(mockUpdate).toHaveBeenCalledWith({ completed: false })
    })

    // One-way sync: completing a task spawned FROM a list item (Needed Today
    // scheduling) also checks the item off its list. Never the reverse, and
    // never on un-complete.
    it('checks the linked list item off when completing a list_item-linked task', async () => {
      mockSupabaseData.push(createMockDbTask({
        id: 'task-1', completed: false,
        linked_activity_type: 'list_item', linked_activity_id: 'li-9',
      } as never))

      const { result } = renderHook(() => useSupabaseTasks())
      await waitFor(() => expect(result.current.tasks).toHaveLength(1))

      await act(async () => {
        await result.current.toggleTask('task-1')
      })

      await waitFor(() => {
        expect(mockUpdateEq).toHaveBeenCalledWith(
          expect.objectContaining({ completed: true, completed_at: expect.any(String) }),
          'id', 'li-9',
        )
      })
    })

    it('does not touch the list item when un-completing', async () => {
      mockSupabaseData.push(createMockDbTask({
        id: 'task-1', completed: true,
        linked_activity_type: 'list_item', linked_activity_id: 'li-9',
      } as never))

      const { result } = renderHook(() => useSupabaseTasks())
      await waitFor(() => expect(result.current.tasks).toHaveLength(1))

      await act(async () => {
        await result.current.toggleTask('task-1')
      })

      expect(mockUpdateEq).not.toHaveBeenCalledWith(
        expect.objectContaining({ completed_at: expect.any(String) }),
        'id', 'li-9',
      )
    })

    it('rolls back on server error', async () => {
      mockSupabaseData.push(createMockDbTask({ id: 'task-1', completed: false }))

      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.tasks).toHaveLength(1)
      })

      mockError = { message: 'Toggle failed' }

      await act(async () => {
        await result.current.toggleTask('task-1')
      })

      // Should roll back
      expect(result.current.tasks[0].completed).toBe(false)
    })
  })

  describe('deleteTask', () => {
    it('removes task from local state immediately', async () => {
      mockSupabaseData.push(
        createMockDbTask({ id: 'task-1', title: 'Task 1' }),
        createMockDbTask({ id: 'task-2', title: 'Task 2' })
      )

      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.tasks).toHaveLength(2)
      })

      await act(async () => {
        await result.current.deleteTask('task-1')
      })

      expect(result.current.tasks).toHaveLength(1)
      expect(result.current.tasks[0].id).toBe('task-2')
    })

    it('calls supabase delete', async () => {
      mockSupabaseData.push(createMockDbTask({ id: 'task-1' }))

      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.tasks).toHaveLength(1)
      })

      await act(async () => {
        await result.current.deleteTask('task-1')
      })

      expect(mockDelete).toHaveBeenCalled()
      expect(mockEq).toHaveBeenCalledWith('id', 'task-1')
    })

    it('rolls back if delete fails', async () => {
      mockSupabaseData.push(createMockDbTask({ id: 'task-1', title: 'Task 1' }))

      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.tasks).toHaveLength(1)
      })

      mockError = { message: 'Delete failed' }

      await act(async () => {
        await result.current.deleteTask('task-1')
      })

      // Should roll back
      expect(result.current.tasks).toHaveLength(1)
      expect(result.current.tasks[0].id).toBe('task-1')
    })
  })

  describe('scheduleTask', () => {
    it('updates scheduledFor to new date', async () => {
      mockSupabaseData.push(createMockDbTask({ id: 'task-1' }))

      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.tasks).toHaveLength(1)
      })

      const newDate = new Date('2024-07-01T09:00:00Z')

      await act(async () => {
        await result.current.scheduleTask('task-1', newDate)
      })

      expect(result.current.tasks[0].scheduledFor).toEqual(newDate)
    })

    it('sets isAllDay to true by default', async () => {
      mockSupabaseData.push(createMockDbTask({ id: 'task-1' }))

      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.tasks).toHaveLength(1)
      })

      const newDate = new Date('2024-07-01')

      await act(async () => {
        await result.current.scheduleTask('task-1', newDate)
      })

      expect(result.current.tasks[0].isAllDay).toBe(true)
    })

    it('allows setting isAllDay to false', async () => {
      mockSupabaseData.push(createMockDbTask({ id: 'task-1' }))

      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.tasks).toHaveLength(1)
      })

      const newDate = new Date('2024-07-01T14:30:00Z')

      await act(async () => {
        await result.current.scheduleTask('task-1', newDate, false)
      })

      expect(result.current.tasks[0].isAllDay).toBe(false)
    })

    // FIXME(behavior-drift): scheduleTask no longer clears deferred_until on the
    // client (see scheduleTask — it only sets bucket/scheduledFor/isAllDay). This
    // test asserts removed client behavior. Left skipped pending a product
    // decision: is client-side defer tracking gone for good (e.g. moved to a DB
    // trigger / dropped for the "carried over" model) or a regression?
    it.skip('clears deferredUntil when scheduling', async () => {
      mockSupabaseData.push(createMockDbTask({
        id: 'task-1',
        deferred_until: '2024-06-01'
      }))

      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.tasks).toHaveLength(1)
      })

      const newDate = new Date('2024-07-01')

      await act(async () => {
        await result.current.scheduleTask('task-1', newDate)
      })

      expect(result.current.tasks[0].deferredUntil).toBeUndefined()
    })
  })

  describe('pushTask', () => {
    it('updates scheduledFor for scheduled tasks', async () => {
      const originalDate = new Date('2024-06-15T10:00:00Z')
      mockSupabaseData.push(createMockDbTask({
        id: 'task-1',
        scheduled_for: originalDate.toISOString()
      }))

      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.tasks).toHaveLength(1)
      })

      const newDate = new Date('2024-06-20')

      await act(async () => {
        await result.current.pushTask('task-1', newDate)
      })

      expect(result.current.tasks[0].scheduledFor).toBeDefined()
    })

    // FIXME(behavior-drift): pushTask no longer increments defer_count on the
    // client (see pushTask — it sets bucket/scheduledFor/isAllDay only). Same
    // open product question as the skipped scheduleTask test above.
    it.skip('increments deferCount', async () => {
      mockSupabaseData.push(createMockDbTask({
        id: 'task-1',
        scheduled_for: '2024-06-15T10:00:00Z',
        defer_count: 2
      }))

      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.tasks).toHaveLength(1)
      })

      const newDate = new Date('2024-06-20')

      await act(async () => {
        await result.current.pushTask('task-1', newDate)
      })

      expect(result.current.tasks[0].deferCount).toBe(3)
    })

    // FIXME(behavior-drift): pushTask no longer sets deferred_until on the client.
    // Same open product question as the two skipped defer tests above.
    it.skip('sets deferredUntil for inbox tasks', async () => {
      mockSupabaseData.push(createMockDbTask({
        id: 'task-1',
        scheduled_for: null // inbox task
      }))

      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.tasks).toHaveLength(1)
      })

      const deferDate = new Date('2024-06-25')

      await act(async () => {
        await result.current.pushTask('task-1', deferDate)
      })

      expect(result.current.tasks[0].deferredUntil).toEqual(deferDate)
    })

    it('marks the task all-day when scheduled to a day with no specific time', async () => {
      // The inbox → "Today"/a-day flow passes a date at local midnight (no time
      // chosen). That must persist isAllDay:true, or the task gets a midnight
      // scheduledFor with isAllDay undefined and is mis-bucketed everywhere.
      mockSupabaseData.push(createMockDbTask({ id: 'task-1', scheduled_for: null }))
      const { result } = renderHook(() => useSupabaseTasks())
      await waitFor(() => expect(result.current.tasks).toHaveLength(1))

      const day = new Date(2024, 5, 20) // local midnight = "no time"
      await act(async () => {
        await result.current.pushTask('task-1', day)
      })

      expect(result.current.tasks[0].bucket).toBe('timed')
      expect(result.current.tasks[0].isAllDay).toBe(true)
    })

    it('keeps the task timed (isAllDay false) when scheduled to a specific time', async () => {
      mockSupabaseData.push(createMockDbTask({ id: 'task-1', scheduled_for: null }))
      const { result } = renderHook(() => useSupabaseTasks())
      await waitFor(() => expect(result.current.tasks).toHaveLength(1))

      const at230pm = new Date(2024, 5, 20, 14, 30)
      await act(async () => {
        await result.current.pushTask('task-1', at230pm)
      })

      expect(result.current.tasks[0].isAllDay).toBe(false)
    })
  })

  describe('data transformation', () => {
    it('converts snake_case DB fields to camelCase', async () => {
      mockSupabaseData.push(createMockDbTask({
        id: 'task-1',
        scheduled_for: '2024-06-15T10:00:00Z',
        deferred_until: '2024-06-20',
        defer_count: 3,
        is_all_day: true,
        phone_number: '555-1234',
        contact_id: 'contact-1',
        assigned_to: 'family-1',
        project_id: 'project-1',
        created_at: '2024-01-01T00:00:00Z',
      }))

      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.tasks).toHaveLength(1)
      })

      const task = result.current.tasks[0]
      expect(task.scheduledFor).toBeInstanceOf(Date)
      expect(task.deferredUntil).toBeInstanceOf(Date)
      expect(task.deferCount).toBe(3)
      expect(task.isAllDay).toBe(true)
      expect(task.phoneNumber).toBe('555-1234')
      expect(task.contactId).toBe('contact-1')
      expect(task.assignedTo).toBe('family-1')
      expect(task.projectId).toBe('project-1')
      expect(task.createdAt).toBeInstanceOf(Date)
    })

    it('handles null optional fields', async () => {
      mockSupabaseData.push(createMockDbTask({
        id: 'task-1',
        scheduled_for: null,
        deferred_until: null,
        defer_count: null,
        is_all_day: null,
        context: null,
        notes: null,
        links: null,
        phone_number: null,
        contact_id: null,
        assigned_to: null,
        project_id: null,
      }))

      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.tasks).toHaveLength(1)
      })

      const task = result.current.tasks[0]
      expect(task.scheduledFor).toBeUndefined()
      expect(task.deferredUntil).toBeUndefined()
      expect(task.deferCount).toBeUndefined()
      expect(task.isAllDay).toBeUndefined()
      // context is nullable in the Task model (null = no domain); dbTaskToTask
      // maps a null DB value to null, not undefined.
      expect(task.context).toBeNull()
      expect(task.notes).toBeUndefined()
      expect(task.links).toBeUndefined()
      expect(task.phoneNumber).toBeUndefined()
      expect(task.contactId).toBeUndefined()
      expect(task.assignedTo).toBeUndefined()
      expect(task.projectId).toBeUndefined()
    })

    it('parses date strings to Date objects', async () => {
      mockSupabaseData.push(createMockDbTask({
        id: 'task-1',
        scheduled_for: '2024-06-15T10:00:00Z',
        created_at: '2024-01-01T12:00:00Z',
      }))

      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.tasks).toHaveLength(1)
      })

      const task = result.current.tasks[0]
      expect(task.scheduledFor).toBeInstanceOf(Date)
      expect(task.scheduledFor?.toISOString()).toBe('2024-06-15T10:00:00.000Z')
      expect(task.createdAt).toBeInstanceOf(Date)
      expect(task.createdAt.toISOString()).toBe('2024-01-01T12:00:00.000Z')
    })

    it('normalizes old string link format to TaskLink objects', async () => {
      mockSupabaseData.push(createMockDbTask({
        id: 'task-1',
        links: ['https://example.com', 'https://test.com'],
      }))

      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.tasks).toHaveLength(1)
      })

      const task = result.current.tasks[0]
      expect(task.links).toEqual([
        { url: 'https://example.com' },
        { url: 'https://test.com' },
      ])
    })

    it('preserves new TaskLink format', async () => {
      mockSupabaseData.push(createMockDbTask({
        id: 'task-1',
        links: [
          { url: 'https://example.com', title: 'Example' },
          { url: 'https://test.com', title: 'Test' },
        ],
      }))

      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.tasks).toHaveLength(1)
      })

      const task = result.current.tasks[0]
      expect(task.links).toEqual([
        { url: 'https://example.com', title: 'Example' },
        { url: 'https://test.com', title: 'Test' },
      ])
    })

    it('round-trips sort_order', async () => {
      mockSupabaseData.push(createMockDbTask({
        id: 'task-1',
        sort_order: 2000,
      } as any))

      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.tasks).toHaveLength(1)
      })

      const task = result.current.tasks[0]
      expect(task.sortOrder).toBe(2000)
    })

    it('treats a missing sort_order as null, not 0', async () => {
      mockSupabaseData.push(createMockDbTask({
        id: 'task-1',
        sort_order: null,
      } as any))

      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.tasks).toHaveLength(1)
      })

      const task = result.current.tasks[0]
      expect(task.sortOrder).toBeNull()
    })
  })

  // Every hook instance keeps its own state; the detail panel and the Today
  // list are DIFFERENT instances. These tests pin the same-tab write fan-out:
  // a successful write in one instance must reach every other mounted instance
  // synchronously — without a Supabase realtime round-trip (which is dead in a
  // slept/stale tab and was the "reschedule in the panel, Today never changes"
  // bug).
  describe('same-tab cross-instance sync', () => {
    async function renderTwoInstances() {
      const a = renderHook(() => useSupabaseTasks())
      const b = renderHook(() => useSupabaseTasks())
      await waitFor(() => expect(a.result.current.loading).toBe(false))
      await waitFor(() => expect(b.result.current.loading).toBe(false))
      return { a, b }
    }

    it('a reschedule in one instance moves the task in the other instance', async () => {
      mockSupabaseData.push(createMockDbTask({ id: 'task-1', title: 'Task 1' }))
      const { a, b } = await renderTwoInstances()

      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(0, 0, 0, 0)
      await act(async () => {
        await a.result.current.updateTask('task-1', {
          bucket: 'timed',
          scheduledFor: tomorrow,
          isAllDay: true,
        })
      })

      const seenByB = b.result.current.tasks.find((t) => t.id === 'task-1')
      expect(seenByB?.scheduledFor?.getTime()).toBe(tomorrow.getTime())
      expect(seenByB?.bucket).toBe('timed')
    })

    it('toggleTask completion reaches the other instance', async () => {
      mockSupabaseData.push(createMockDbTask({ id: 'task-1', completed: false }))
      const { a, b } = await renderTwoInstances()

      await act(async () => {
        await a.result.current.toggleTask('task-1')
      })

      expect(b.result.current.tasks.find((t) => t.id === 'task-1')?.completed).toBe(true)
    })

    it('deleteTask removes the task from the other instance', async () => {
      mockSupabaseData.push(createMockDbTask({ id: 'task-1' }))
      const { a, b } = await renderTwoInstances()

      await act(async () => {
        await a.result.current.deleteTask('task-1')
      })

      expect(b.result.current.tasks.find((t) => t.id === 'task-1')).toBeUndefined()
    })

    it('addTask appears in the other instance', async () => {
      const { a, b } = await renderTwoInstances()

      await act(async () => {
        await a.result.current.addTask('Brand new task')
      })

      expect(b.result.current.tasks.some((t) => t.title === 'Brand new task')).toBe(true)
    })

    it('an unmounted instance stops listening (no zombie writes)', async () => {
      mockSupabaseData.push(createMockDbTask({ id: 'task-1', title: 'Task 1' }))
      const { a, b } = await renderTwoInstances()
      b.unmount()

      await act(async () => {
        await a.result.current.updateTask('task-1', { title: 'Renamed' })
      })

      // The unmounted hook's last state is frozen — no update applied.
      expect(b.result.current.tasks.find((t) => t.id === 'task-1')?.title).toBe('Task 1')
    })
  })
})
