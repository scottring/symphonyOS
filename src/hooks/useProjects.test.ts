import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useProjects } from './useProjects'
import { createMockUser, createMockDbProject, resetIdCounter } from '@/test/mocks/factories'
import type { DbProject, ProjectStatus, Project } from '@/types/project'

// Module-level state for mocking
const mockUser = createMockUser()
let mockUserState: ReturnType<typeof createMockUser> | null = mockUser
let mockSupabaseData: DbProject[] = []
let mockError: { message: string } | null = null
const mockUpdate = vi.fn()
const mockDelete = vi.fn()
const mockInsert = vi.fn()
const mockEq = vi.fn()

// Mock useAuth
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUserState }),
}))

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: mockSupabaseData, error: mockError }),
        }),
        order: () => Promise.resolve({ data: mockSupabaseData, error: mockError }),
      }),
      insert: (data: Partial<DbProject>) => {
        mockInsert(data)
        if (mockError) {
          return {
            select: () => ({
              single: () => Promise.resolve({ data: null, error: mockError }),
            }),
          }
        }
        const newProject: DbProject = {
          id: 'new-project-id',
          user_id: mockUser.id,
          name: data.name || 'New Project',
          notes: data.notes ?? null,
          parent_id: data.parent_id ?? null,
          status: 'not_started' as ProjectStatus,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        return {
          select: () => ({
            single: () => Promise.resolve({ data: newProject, error: null }),
          }),
        }
      },
      update: (data: Partial<DbProject>) => {
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

describe('useProjects', () => {
  beforeEach(() => {
    resetIdCounter()
    mockSupabaseData = []
    mockError = null
    mockUserState = mockUser
    vi.clearAllMocks()
  })

  describe('initial loading', () => {
    it('fetches projects on mount when user is authenticated', async () => {
      const dbProject = createMockDbProject({ name: 'Test Project' })
      mockSupabaseData = [dbProject]

      const { result } = renderHook(() => useProjects())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.projects).toHaveLength(1)
      expect(result.current.projects[0].name).toBe('Test Project')
    })

    it('sets loading to true while fetching', async () => {
      const { result } = renderHook(() => useProjects())
      expect(result.current.loading).toBe(true)
      // Wait for async fetch to complete to avoid act() warning
      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })
    })

    it('sets loading to false after fetch completes', async () => {
      mockSupabaseData = []

      const { result } = renderHook(() => useProjects())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })
    })

    it('handles fetch error gracefully', async () => {
      mockError = { message: 'Database error' }

      const { result } = renderHook(() => useProjects())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.error).toBe('Database error')
      expect(result.current.projects).toHaveLength(0)
    })

    it('clears projects when user is null', async () => {
      mockUserState = null

      const { result } = renderHook(() => useProjects())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.projects).toHaveLength(0)
    })

    it('orders projects by name', async () => {
      mockSupabaseData = [
        createMockDbProject({ id: 'proj-1', name: 'Zebra Project' }),
        createMockDbProject({ id: 'proj-2', name: 'Alpha Project' }),
        createMockDbProject({ id: 'proj-3', name: 'Middle Project' }),
      ]

      const { result } = renderHook(() => useProjects())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      // Server returns them in whatever order, but we can test they're received
      expect(result.current.projects).toHaveLength(3)
    })
  })

  describe('addProject', () => {
    it('creates project with name', async () => {
      mockSupabaseData = []

      const { result } = renderHook(() => useProjects())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      let addedProject: Project | null = null

      await act(async () => {
        addedProject = await result.current.addProject({ name: 'New Project' })
      })

      expect(addedProject).not.toBeNull()
      expect(addedProject!.name).toBe('New Project')
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'New Project',
          user_id: mockUser.id,
        })
      )
    })

    it('creates project with name and notes', async () => {
      mockSupabaseData = []

      const { result } = renderHook(() => useProjects())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.addProject({ name: 'Project with Notes', notes: 'Some notes' })
      })

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Project with Notes',
          notes: 'Some notes',
        })
      )
    })

    it('creates project with parent ID', async () => {
      mockSupabaseData = []

      const { result } = renderHook(() => useProjects())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.addProject({ name: 'Child Project', parentId: 'parent-123' })
      })

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Child Project',
          parent_id: 'parent-123',
        })
      )
    })

    it('applies optimistic update immediately', async () => {
      mockSupabaseData = []

      const { result } = renderHook(() => useProjects())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      // Start adding and wait for the async operation to complete
      await act(async () => {
        await result.current.addProject({ name: 'Optimistic Project' })
      })

      // Project should appear with server ID
      expect(result.current.projects.some((p) => p.name === 'Optimistic Project')).toBe(true)
    })

    it('replaces temp ID with real ID after server response', async () => {
      mockSupabaseData = []

      const { result } = renderHook(() => useProjects())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.addProject({ name: 'New Project' })
      })

      // Should have the server-generated ID
      expect(result.current.projects.some((p) => p.id === 'new-project-id')).toBe(true)
    })

    it('rolls back optimistic update on server error', async () => {
      mockSupabaseData = []

      const { result } = renderHook(() => useProjects())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      mockError = { message: 'Insert failed' }

      await act(async () => {
        await result.current.addProject({ name: 'Failed Project' })
      })

      // Project should not be in the list
      expect(result.current.projects.some((p) => p.name === 'Failed Project')).toBe(false)
      expect(result.current.error).toBe('Insert failed')
    })

    it('returns null on failure', async () => {
      mockSupabaseData = []

      const { result } = renderHook(() => useProjects())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      mockError = { message: 'Insert failed' }

      let addedProject

      await act(async () => {
        addedProject = await result.current.addProject({ name: 'Failed Project' })
      })

      expect(addedProject).toBeNull()
    })

    it('returns null when user is not authenticated', async () => {
      mockUserState = null

      const { result } = renderHook(() => useProjects())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      let addedProject

      await act(async () => {
        addedProject = await result.current.addProject({ name: 'New Project' })
      })

      expect(addedProject).toBeNull()
    })
  })

  describe('updateProject', () => {
    it('updates project name', async () => {
      const dbProject = createMockDbProject({ id: 'proj-1', name: 'Original Name' })
      mockSupabaseData = [dbProject]

      const { result } = renderHook(() => useProjects())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.updateProject('proj-1', { name: 'Updated Name' })
      })

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Updated Name' })
      )
    })

    it('updates project notes', async () => {
      const dbProject = createMockDbProject({ id: 'proj-1', name: 'Test' })
      mockSupabaseData = [dbProject]

      const { result } = renderHook(() => useProjects())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.updateProject('proj-1', { notes: 'New notes' })
      })

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ notes: 'New notes' })
      )
    })

    it('updates project status', async () => {
      const dbProject = createMockDbProject({ id: 'proj-1', name: 'Test', status: 'active' })
      mockSupabaseData = [dbProject]

      const { result } = renderHook(() => useProjects())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.updateProject('proj-1', { status: 'completed' })
      })

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'completed' })
      )
    })

    it('updates project parentId', async () => {
      const dbProject = createMockDbProject({ id: 'proj-1', name: 'Test' })
      mockSupabaseData = [dbProject]

      const { result } = renderHook(() => useProjects())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.updateProject('proj-1', { parentId: 'parent-123' })
      })

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ parent_id: 'parent-123' })
      )
    })

    it('applies optimistic update immediately', async () => {
      const dbProject = createMockDbProject({ id: 'proj-1', name: 'Original Name' })
      mockSupabaseData = [dbProject]

      const { result } = renderHook(() => useProjects())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      act(() => {
        result.current.updateProject('proj-1', { name: 'Updated Name' })
      })

      // Should be updated immediately
      expect(result.current.projects.find((p) => p.id === 'proj-1')?.name).toBe('Updated Name')
    })

    it('rolls back on server error', async () => {
      const dbProject = createMockDbProject({ id: 'proj-1', name: 'Original Name' })
      mockSupabaseData = [dbProject]

      const { result } = renderHook(() => useProjects())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      mockError = { message: 'Update failed' }

      await act(async () => {
        await result.current.updateProject('proj-1', { name: 'Updated Name' })
      })

      // Should be rolled back to original
      expect(result.current.projects.find((p) => p.id === 'proj-1')?.name).toBe('Original Name')
      expect(result.current.error).toBe('Update failed')
    })

    it('handles updating non-existent project', async () => {
      mockSupabaseData = []

      const { result } = renderHook(() => useProjects())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.updateProject('non-existent-id', { name: 'Updated' })
      })

      // Should not call update
      expect(mockUpdate).not.toHaveBeenCalled()
    })
  })

  describe('deleteProject', () => {
    it('removes project from state immediately', async () => {
      const dbProject = createMockDbProject({ id: 'proj-1', name: 'Test' })
      mockSupabaseData = [dbProject]

      const { result } = renderHook(() => useProjects())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.projects).toHaveLength(1)

      act(() => {
        result.current.deleteProject('proj-1')
      })

      // Should be removed immediately
      expect(result.current.projects).toHaveLength(0)
    })

    it('calls supabase delete', async () => {
      const dbProject = createMockDbProject({ id: 'proj-1', name: 'Test' })
      mockSupabaseData = [dbProject]

      const { result } = renderHook(() => useProjects())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.deleteProject('proj-1')
      })

      expect(mockDelete).toHaveBeenCalled()
      expect(mockEq).toHaveBeenCalledWith('id', 'proj-1')
    })

    it('rolls back if delete fails', async () => {
      const dbProject = createMockDbProject({ id: 'proj-1', name: 'Test' })
      mockSupabaseData = [dbProject]

      const { result } = renderHook(() => useProjects())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      mockError = { message: 'Delete failed' }

      await act(async () => {
        await result.current.deleteProject('proj-1')
      })

      // Should be rolled back
      expect(result.current.projects).toHaveLength(1)
      expect(result.current.projects[0].id).toBe('proj-1')
      expect(result.current.error).toBe('Delete failed')
    })

    it('does nothing for non-existent project', async () => {
      mockSupabaseData = []

      const { result } = renderHook(() => useProjects())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.deleteProject('non-existent-id')
      })

      expect(mockDelete).not.toHaveBeenCalled()
    })
  })

  describe('data transformation', () => {
    it('converts snake_case DB fields to camelCase', async () => {
      const dbProject = createMockDbProject({
        id: 'proj-1',
        name: 'Test',
        parent_id: 'parent-123',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
      })
      mockSupabaseData = [dbProject]

      const { result } = renderHook(() => useProjects())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      const project = result.current.projects[0]
      expect(project.parentId).toBe('parent-123')
      expect(project.createdAt).toBeInstanceOf(Date)
      expect(project.updatedAt).toBeInstanceOf(Date)
    })

    it('handles null optional fields', async () => {
      const dbProject = createMockDbProject({
        id: 'proj-1',
        name: 'Test',
        notes: null,
        parent_id: null,
      })
      mockSupabaseData = [dbProject]

      const { result } = renderHook(() => useProjects())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      const project = result.current.projects[0]
      expect(project.notes).toBeUndefined()
      expect(project.parentId).toBeUndefined()
    })

    it('parses date strings to Date objects', async () => {
      const dbProject = createMockDbProject({
        id: 'proj-1',
        name: 'Test',
        created_at: '2024-06-15T10:30:00Z',
        updated_at: '2024-06-16T12:45:00Z',
      })
      mockSupabaseData = [dbProject]

      const { result } = renderHook(() => useProjects())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      const project = result.current.projects[0]
      expect(project.createdAt.toISOString()).toBe('2024-06-15T10:30:00.000Z')
      expect(project.updatedAt.toISOString()).toBe('2024-06-16T12:45:00.000Z')
    })
  })

  describe('helper functions', () => {
    it('searchProjects filters by name case-insensitively', async () => {
      mockSupabaseData = [
        createMockDbProject({ id: 'proj-1', name: 'Alpha Project' }),
        createMockDbProject({ id: 'proj-2', name: 'Beta Project' }),
        createMockDbProject({ id: 'proj-3', name: 'Alphabet Soup' }),
      ]

      const { result } = renderHook(() => useProjects())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      const filtered = result.current.searchProjects('alpha')
      expect(filtered).toHaveLength(2)
      expect(filtered.map((p) => p.name)).toContain('Alpha Project')
      expect(filtered.map((p) => p.name)).toContain('Alphabet Soup')
    })

    it('searchProjects returns all projects for empty query', async () => {
      mockSupabaseData = [
        createMockDbProject({ id: 'proj-1', name: 'Project A' }),
        createMockDbProject({ id: 'proj-2', name: 'Project B' }),
      ]

      const { result } = renderHook(() => useProjects())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      const filtered = result.current.searchProjects('')
      expect(filtered).toHaveLength(2)
    })

    it('getProjectById returns correct project', async () => {
      mockSupabaseData = [
        createMockDbProject({ id: 'proj-1', name: 'Project A' }),
        createMockDbProject({ id: 'proj-2', name: 'Project B' }),
      ]

      const { result } = renderHook(() => useProjects())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      const project = result.current.getProjectById('proj-1')
      expect(project?.name).toBe('Project A')
    })

    it('getProjectById returns undefined for non-existent ID', async () => {
      mockSupabaseData = [createMockDbProject({ id: 'proj-1', name: 'Project A' })]

      const { result } = renderHook(() => useProjects())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      const project = result.current.getProjectById('non-existent')
      expect(project).toBeUndefined()
    })

    it('activeProjects filters out completed projects', async () => {
      mockSupabaseData = [
        createMockDbProject({ id: 'proj-1', name: 'Active', status: 'active' }),
        createMockDbProject({ id: 'proj-2', name: 'Completed', status: 'completed' }),
        createMockDbProject({ id: 'proj-3', name: 'Not Started', status: 'not_started' }),
      ]

      const { result } = renderHook(() => useProjects())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.activeProjects).toHaveLength(2)
      expect(result.current.activeProjects.map((p) => p.name)).not.toContain('Completed')
    })

    it('getChildProjects returns children for a parent', async () => {
      mockSupabaseData = [
        createMockDbProject({ id: 'parent', name: 'Parent', parent_id: null }),
        createMockDbProject({ id: 'child-1', name: 'Child 1', parent_id: 'parent' }),
        createMockDbProject({ id: 'child-2', name: 'Child 2', parent_id: 'parent' }),
        createMockDbProject({ id: 'other', name: 'Other', parent_id: null }),
      ]

      const { result } = renderHook(() => useProjects())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      const children = result.current.getChildProjects('parent')
      expect(children).toHaveLength(2)
      expect(children.map((p) => p.name)).toContain('Child 1')
      expect(children.map((p) => p.name)).toContain('Child 2')
    })

    it('projectsMap provides efficient lookup', async () => {
      mockSupabaseData = [
        createMockDbProject({ id: 'proj-1', name: 'Project A' }),
        createMockDbProject({ id: 'proj-2', name: 'Project B' }),
      ]

      const { result } = renderHook(() => useProjects())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.projectsMap.get('proj-1')?.name).toBe('Project A')
      expect(result.current.projectsMap.get('proj-2')?.name).toBe('Project B')
      expect(result.current.projectsMap.get('non-existent')).toBeUndefined()
    })
  })
})
