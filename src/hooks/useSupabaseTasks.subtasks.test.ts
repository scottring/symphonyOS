import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useSupabaseTasks } from './useSupabaseTasks'
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
  created_at: string
  updated_at: string
}

const mockSupabaseData: MockDbTask[] = []
let mockError: { message: string } | null = null

// Track calls
const mockUpdate = vi.fn()
const mockInsert = vi.fn()
const mockEq = vi.fn()
const mockIn = vi.fn()

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
      }),
      insert: (data: Partial<MockDbTask>) => {
        mockInsert(data)
        const newTask = createMockDbTask({
          ...data,
          id: `new-${Date.now()}`,
        })
        return {
          select: () => ({
            single: () => {
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
        return {
          eq: (field: string, value: string) => {
            mockEq(field, value)
            return Promise.resolve({ error: mockError })
          },
          in: (field: string, values: string[]) => {
            mockIn(field, values)
            return Promise.resolve({ error: mockError })
          },
        }
      },
      delete: () => ({
        eq: () => Promise.resolve({ error: mockError }),
      }),
    }),
  },
}))

describe('useSupabaseTasks - Subtasks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseData.length = 0
    mockError = null
    mockAuthUser = mockUser
    resetIdCounter()
  })

  describe('nestSubtasks', () => {
    it('should nest subtasks under parent tasks', async () => {
      mockSupabaseData.push(
        createMockDbTask({ id: 'parent-1', title: 'Parent Task' }),
        createMockDbTask({ id: 'subtask-1', title: 'Subtask 1', parent_task_id: 'parent-1' }),
        createMockDbTask({ id: 'subtask-2', title: 'Subtask 2', parent_task_id: 'parent-1' })
      )

      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      // Should only have parent at top level
      expect(result.current.tasks).toHaveLength(1)
      expect(result.current.tasks[0].id).toBe('parent-1')

      // Parent should have 2 subtasks
      expect(result.current.tasks[0].subtasks).toHaveLength(2)
      expect(result.current.tasks[0].subtasks![0].id).toBe('subtask-1')
      expect(result.current.tasks[0].subtasks![1].id).toBe('subtask-2')
    })

    it('should filter subtasks out of top-level array', async () => {
      mockSupabaseData.push(
        createMockDbTask({ id: 'parent-1', title: 'Parent Task' }),
        createMockDbTask({ id: 'standalone-1', title: 'Standalone Task' }),
        createMockDbTask({ id: 'subtask-1', title: 'Subtask', parent_task_id: 'parent-1' })
      )

      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      // Should only have 2 top-level tasks (parent + standalone)
      expect(result.current.tasks).toHaveLength(2)
      const taskIds = result.current.tasks.map(t => t.id)
      expect(taskIds).toContain('parent-1')
      expect(taskIds).toContain('standalone-1')
      expect(taskIds).not.toContain('subtask-1')
    })

    it('should handle orphaned subtasks gracefully', async () => {
      // Subtask with non-existent parent
      mockSupabaseData.push(
        createMockDbTask({ id: 'orphan-1', title: 'Orphan Subtask', parent_task_id: 'non-existent' }),
        createMockDbTask({ id: 'standalone-1', title: 'Standalone Task' })
      )

      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      // Orphaned subtasks should be filtered out (not show at top level)
      expect(result.current.tasks).toHaveLength(1)
      expect(result.current.tasks[0].id).toBe('standalone-1')
    })
  })

  describe('addSubtask', () => {
    it('should create a subtask with parent_task_id set', async () => {
      mockSupabaseData.push(
        createMockDbTask({ id: 'parent-1', title: 'Parent Task', project_id: 'proj-1', contact_id: 'contact-1' })
      )

      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.addSubtask('parent-1', 'New Subtask')
      })

      // Verify insert was called with parent_task_id
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          parent_task_id: 'parent-1',
        })
      )
    })

    it('should inherit project_id and contact_id from parent', async () => {
      mockSupabaseData.push(
        createMockDbTask({
          id: 'parent-1',
          title: 'Parent Task',
          project_id: 'inherited-project',
          contact_id: 'inherited-contact',
        })
      )

      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.addSubtask('parent-1', 'New Subtask')
      })

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          project_id: 'inherited-project',
          contact_id: 'inherited-contact',
        })
      )
    })

    it('should return undefined if parent not found', async () => {
      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      let subtaskId: string | undefined
      await act(async () => {
        subtaskId = await result.current.addSubtask('non-existent', 'New Subtask')
      })

      expect(subtaskId).toBeUndefined()
      expect(mockInsert).not.toHaveBeenCalled()
    })
  })

  describe('toggleTask with subtasks', () => {
    it('should complete all subtasks when completing parent', async () => {
      mockSupabaseData.push(
        createMockDbTask({ id: 'parent-1', title: 'Parent Task', completed: false }),
        createMockDbTask({ id: 'subtask-1', title: 'Subtask 1', parent_task_id: 'parent-1', completed: false }),
        createMockDbTask({ id: 'subtask-2', title: 'Subtask 2', parent_task_id: 'parent-1', completed: false })
      )

      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.toggleTask('parent-1')
      })

      // Should have called update for parent
      expect(mockUpdate).toHaveBeenCalledWith({ completed: true })
      // Should have called update with 'in' for subtasks
      expect(mockIn).toHaveBeenCalledWith('id', ['subtask-1', 'subtask-2'])
    })

    it('should not complete parent when completing all subtasks', async () => {
      mockSupabaseData.push(
        createMockDbTask({ id: 'parent-1', title: 'Parent Task', completed: false }),
        createMockDbTask({ id: 'subtask-1', title: 'Subtask 1', parent_task_id: 'parent-1', completed: false })
      )

      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.toggleTask('subtask-1')
      })

      // After toggle, parent should still be incomplete
      const parent = result.current.tasks.find(t => t.id === 'parent-1')
      expect(parent?.completed).toBe(false)
    })

    it('should mark subtask as complete without affecting parent', async () => {
      mockSupabaseData.push(
        createMockDbTask({ id: 'parent-1', title: 'Parent Task', completed: false }),
        createMockDbTask({ id: 'subtask-1', title: 'Subtask 1', parent_task_id: 'parent-1', completed: false })
      )

      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.toggleTask('subtask-1')
      })

      // Subtask should be completed
      const parent = result.current.tasks.find(t => t.id === 'parent-1')
      const subtask = parent?.subtasks?.find(s => s.id === 'subtask-1')
      expect(subtask?.completed).toBe(true)
    })
  })

  describe('subtask scheduling', () => {
    it('should allow subtasks to have independent scheduled_for dates', async () => {
      mockSupabaseData.push(
        createMockDbTask({
          id: 'parent-1',
          title: 'Parent Task',
          scheduled_for: '2024-01-15T10:00:00Z',
        }),
        createMockDbTask({
          id: 'subtask-1',
          title: 'Subtask 1',
          parent_task_id: 'parent-1',
          scheduled_for: '2024-01-20T14:00:00Z', // Different date than parent
        })
      )

      const { result } = renderHook(() => useSupabaseTasks())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      const parent = result.current.tasks.find(t => t.id === 'parent-1')
      const subtask = parent?.subtasks?.find(s => s.id === 'subtask-1')

      expect(parent?.scheduledFor?.toISOString()).toBe('2024-01-15T10:00:00.000Z')
      expect(subtask?.scheduledFor?.toISOString()).toBe('2024-01-20T14:00:00.000Z')
    })
  })
})
