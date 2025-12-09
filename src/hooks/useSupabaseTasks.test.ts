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
    }),
  },
}))

describe('useSupabaseTasks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseData.length = 0
    mockError = null
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
      expect(mockUpdate).toHaveBeenCalledWith({ scheduled_for: newDate.toISOString() })
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
      expect(mockUpdate).toHaveBeenCalledWith({ assigned_to: 'family-member-1' })
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

    it('clears deferredUntil when scheduling', async () => {
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

    it('increments deferCount', async () => {
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

    it('sets deferredUntil for inbox tasks', async () => {
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
      expect(task.context).toBeUndefined()
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
  })
})
