import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useLists } from './useLists'
import type { DbList, ListCategory } from '@/types/list'

// Mock Supabase data
const mockSupabaseData: DbList[] = []

// Create mock functions
const mockOrder = vi.fn()
const mockInsert = vi.fn()
const mockUpdate = vi.fn()
const mockDelete = vi.fn()
const mockSingle = vi.fn()
const mockEq = vi.fn()

// Track user for the mock
let mockUser: { id: string; email: string } | null = { id: 'test-user-id', email: 'test@example.com' }

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: mockUser,
    loading: false,
    error: null,
  }),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        or: () => ({
          order: () => ({
            order: () => mockOrder(),
          }),
        }),
      }),
      insert: (data: unknown) => {
        mockInsert(data)
        return { select: () => ({ single: () => mockSingle() }) }
      },
      update: (data: unknown) => {
        mockUpdate(data)
        return { eq: () => mockEq() }
      },
      delete: () => ({ eq: () => mockDelete() }),
    }),
  },
}))

function createMockDbList(overrides: Partial<DbList> = {}): DbList {
  return {
    id: 'list-1',
    user_id: 'test-user-id',
    title: 'Test List',
    icon: null,
    category: 'other',
    visibility: 'self',
    hidden_from: null,
    project_id: null,
    is_template: false,
    sort_order: 0,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('useLists', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseData.length = 0
    mockUser = { id: 'test-user-id', email: 'test@example.com' }

    // Default mock implementations
    mockOrder.mockImplementation(() =>
      Promise.resolve({ data: mockSupabaseData, error: null })
    )
    mockEq.mockResolvedValue({ error: null })
    mockDelete.mockResolvedValue({ error: null })
  })

  describe('initial state', () => {
    it('starts with empty lists and loading state', async () => {
      const { result } = renderHook(() => useLists())

      expect(result.current.loading).toBe(true)

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.lists).toEqual([])
      expect(result.current.error).toBeNull()
    })

    it('fetches lists on mount', async () => {
      mockSupabaseData.push(createMockDbList())

      const { result } = renderHook(() => useLists())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.lists).toHaveLength(1)
      expect(result.current.lists[0].title).toBe('Test List')
    })

    it('converts snake_case fields to camelCase', async () => {
      mockSupabaseData.push(
        createMockDbList({
          hidden_from: ['user-1', 'user-2'],
          sort_order: 5,
          created_at: '2024-06-15T10:30:00Z',
          updated_at: '2024-06-15T11:45:00Z',
        })
      )

      const { result } = renderHook(() => useLists())

      await waitFor(() => {
        expect(result.current.lists).toHaveLength(1)
      })

      const list = result.current.lists[0]
      expect(list.hiddenFrom).toEqual(['user-1', 'user-2'])
      expect(list.sortOrder).toBe(5)
      expect(list.createdAt).toBeInstanceOf(Date)
      expect(list.updatedAt).toBeInstanceOf(Date)
    })

    it('clears lists when user is null', async () => {
      mockSupabaseData.push(createMockDbList())

      const { result, rerender } = renderHook(() => useLists())

      await waitFor(() => {
        expect(result.current.lists).toHaveLength(1)
      })

      // Simulate logout
      mockUser = null
      rerender()

      await waitFor(() => {
        expect(result.current.lists).toEqual([])
      })
    })
  })

  describe('listsByCategory', () => {
    it('groups lists by category', async () => {
      mockSupabaseData.push(
        createMockDbList({ id: '1', title: 'Movies', category: 'entertainment' }),
        createMockDbList({ id: '2', title: 'Restaurants', category: 'food_drink' }),
        createMockDbList({ id: '3', title: 'Shows', category: 'entertainment' }),
        createMockDbList({ id: '4', title: 'Misc', category: 'other' })
      )

      const { result } = renderHook(() => useLists())

      await waitFor(() => {
        expect(result.current.lists).toHaveLength(4)
      })

      expect(result.current.listsByCategory.entertainment).toHaveLength(2)
      expect(result.current.listsByCategory.food_drink).toHaveLength(1)
      expect(result.current.listsByCategory.other).toHaveLength(1)
      expect(result.current.listsByCategory.shopping).toHaveLength(0)
    })

    it('returns empty arrays for all categories when no lists', async () => {
      const { result } = renderHook(() => useLists())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      const categories: ListCategory[] = [
        'entertainment',
        'food_drink',
        'shopping',
        'travel',
        'family_info',
        'home',
        'other',
      ]

      for (const category of categories) {
        expect(result.current.listsByCategory[category]).toEqual([])
      }
    })
  })

  describe('getListById', () => {
    it('returns list by ID', async () => {
      mockSupabaseData.push(
        createMockDbList({ id: 'list-1', title: 'First' }),
        createMockDbList({ id: 'list-2', title: 'Second' })
      )

      const { result } = renderHook(() => useLists())

      await waitFor(() => {
        expect(result.current.lists).toHaveLength(2)
      })

      const list = result.current.getListById('list-2')
      expect(list).toBeDefined()
      expect(list?.title).toBe('Second')
    })

    it('returns undefined for non-existent ID', async () => {
      mockSupabaseData.push(createMockDbList({ id: 'list-1' }))

      const { result } = renderHook(() => useLists())

      await waitFor(() => {
        expect(result.current.lists).toHaveLength(1)
      })

      const list = result.current.getListById('nonexistent')
      expect(list).toBeUndefined()
    })
  })

  describe('getListsByCategory', () => {
    it('returns lists filtered by category', async () => {
      mockSupabaseData.push(
        createMockDbList({ id: '1', title: 'Movies', category: 'entertainment' }),
        createMockDbList({ id: '2', title: 'Restaurants', category: 'food_drink' }),
        createMockDbList({ id: '3', title: 'Shows', category: 'entertainment' })
      )

      const { result } = renderHook(() => useLists())

      await waitFor(() => {
        expect(result.current.lists).toHaveLength(3)
      })

      const entertainmentLists = result.current.getListsByCategory('entertainment')
      expect(entertainmentLists).toHaveLength(2)
      expect(entertainmentLists.map((l) => l.title)).toContain('Movies')
      expect(entertainmentLists.map((l) => l.title)).toContain('Shows')
    })
  })

  describe('searchLists', () => {
    it('searches lists by title (case-insensitive)', async () => {
      mockSupabaseData.push(
        createMockDbList({ id: '1', title: 'Movies to Watch' }),
        createMockDbList({ id: '2', title: 'Books to Read' }),
        createMockDbList({ id: '3', title: 'MOVIES I Love' })
      )

      const { result } = renderHook(() => useLists())

      await waitFor(() => {
        expect(result.current.lists).toHaveLength(3)
      })

      const matches = result.current.searchLists('movies')
      expect(matches).toHaveLength(2)
    })

    it('returns all lists when query is empty', async () => {
      mockSupabaseData.push(
        createMockDbList({ id: '1', title: 'List 1' }),
        createMockDbList({ id: '2', title: 'List 2' })
      )

      const { result } = renderHook(() => useLists())

      await waitFor(() => {
        expect(result.current.lists).toHaveLength(2)
      })

      const matches = result.current.searchLists('')
      expect(matches).toHaveLength(2)
    })

    it('returns empty array when no matches', async () => {
      mockSupabaseData.push(createMockDbList({ id: '1', title: 'Movies' }))

      const { result } = renderHook(() => useLists())

      await waitFor(() => {
        expect(result.current.lists).toHaveLength(1)
      })

      const matches = result.current.searchLists('xyz')
      expect(matches).toHaveLength(0)
    })
  })

  describe('listsMap', () => {
    it('provides efficient lookup by ID', async () => {
      mockSupabaseData.push(
        createMockDbList({ id: 'list-1', title: 'First' }),
        createMockDbList({ id: 'list-2', title: 'Second' })
      )

      const { result } = renderHook(() => useLists())

      await waitFor(() => {
        expect(result.current.lists).toHaveLength(2)
      })

      expect(result.current.listsMap.get('list-1')?.title).toBe('First')
      expect(result.current.listsMap.get('list-2')?.title).toBe('Second')
      expect(result.current.listsMap.get('nonexistent')).toBeUndefined()
    })
  })

  describe('addList', () => {
    it('creates list with optimistic update', async () => {
      const newList = createMockDbList({ id: 'new-id', title: 'New List' })
      mockSingle.mockResolvedValue({ data: newList, error: null })

      const { result } = renderHook(() => useLists())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      let createdList = null
      await act(async () => {
        createdList = await result.current.addList({ title: 'New List' })
      })

      expect(createdList).not.toBeNull()
      expect(result.current.lists).toHaveLength(1)
      expect(result.current.lists[0].title).toBe('New List')
    })

    it('uses default values when optional fields not provided', async () => {
      const newList = createMockDbList({ id: 'new-id', title: 'Test' })
      mockSingle.mockResolvedValue({ data: newList, error: null })

      const { result } = renderHook(() => useLists())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.addList({ title: 'Test' })
      })

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'other',
          visibility: 'self',
        })
      )
    })

    it('calculates correct sort order', async () => {
      mockSupabaseData.push(
        createMockDbList({ id: '1', sort_order: 0 }),
        createMockDbList({ id: '2', sort_order: 5 }),
        createMockDbList({ id: '3', sort_order: 3 })
      )

      const newList = createMockDbList({ id: 'new', title: 'New', sort_order: 6 })
      mockSingle.mockResolvedValue({ data: newList, error: null })

      const { result } = renderHook(() => useLists())

      await waitFor(() => {
        expect(result.current.lists).toHaveLength(3)
      })

      await act(async () => {
        await result.current.addList({ title: 'New' })
      })

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          sort_order: 6, // max(0,5,3) + 1 = 6
        })
      )
    })

    it('rolls back on error', async () => {
      mockSingle.mockResolvedValue({ data: null, error: { message: 'Insert failed' } })

      const { result } = renderHook(() => useLists())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        const createdList = await result.current.addList({ title: 'Will Fail' })
        expect(createdList).toBeNull()
      })

      expect(result.current.lists).toHaveLength(0)
      expect(result.current.error).toBe('Insert failed')
    })

    it('returns null when user is not authenticated', async () => {
      mockUser = null

      const { result } = renderHook(() => useLists())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        const createdList = await result.current.addList({ title: 'Test' })
        expect(createdList).toBeNull()
      })
    })
  })

  describe('updateList', () => {
    it('updates list with optimistic update', async () => {
      mockSupabaseData.push(createMockDbList({ id: '1', title: 'Original' }))

      const { result } = renderHook(() => useLists())

      await waitFor(() => {
        expect(result.current.lists).toHaveLength(1)
      })

      await act(async () => {
        await result.current.updateList('1', { title: 'Updated' })
      })

      expect(result.current.lists[0].title).toBe('Updated')
    })

    it('handles partial updates', async () => {
      mockSupabaseData.push(
        createMockDbList({
          id: '1',
          title: 'Original',
          category: 'entertainment',
          visibility: 'family',
        })
      )

      const { result } = renderHook(() => useLists())

      await waitFor(() => {
        expect(result.current.lists).toHaveLength(1)
      })

      await act(async () => {
        await result.current.updateList('1', { title: 'New Title' })
      })

      expect(result.current.lists[0].title).toBe('New Title')
      expect(result.current.lists[0].category).toBe('entertainment')
      expect(result.current.lists[0].visibility).toBe('family')
    })

    it('converts camelCase to snake_case for DB', async () => {
      mockSupabaseData.push(createMockDbList({ id: '1' }))

      const { result } = renderHook(() => useLists())

      await waitFor(() => {
        expect(result.current.lists).toHaveLength(1)
      })

      await act(async () => {
        await result.current.updateList('1', {
          hiddenFrom: ['user-1'],
          sortOrder: 10,
        })
      })

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          hidden_from: ['user-1'],
          sort_order: 10,
        })
      )
    })

    it('rolls back on error', async () => {
      mockSupabaseData.push(createMockDbList({ id: '1', title: 'Original' }))
      mockEq.mockResolvedValue({ error: { message: 'Update failed' } })

      const { result } = renderHook(() => useLists())

      await waitFor(() => {
        expect(result.current.lists).toHaveLength(1)
      })

      await act(async () => {
        await result.current.updateList('1', { title: 'Will Fail' })
      })

      expect(result.current.lists[0].title).toBe('Original')
      expect(result.current.error).toBe('Update failed')
    })

    it('does nothing for non-existent list', async () => {
      const { result } = renderHook(() => useLists())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.updateList('nonexistent', { title: 'Test' })
      })

      expect(mockUpdate).not.toHaveBeenCalled()
    })
  })

  describe('deleteList', () => {
    it('deletes list with optimistic update', async () => {
      mockSupabaseData.push(createMockDbList({ id: '1' }))

      const { result } = renderHook(() => useLists())

      await waitFor(() => {
        expect(result.current.lists).toHaveLength(1)
      })

      await act(async () => {
        await result.current.deleteList('1')
      })

      expect(result.current.lists).toHaveLength(0)
    })

    it('rolls back on error', async () => {
      mockSupabaseData.push(createMockDbList({ id: '1', title: 'Will Persist' }))
      mockDelete.mockResolvedValue({ error: { message: 'Delete failed' } })

      const { result } = renderHook(() => useLists())

      await waitFor(() => {
        expect(result.current.lists).toHaveLength(1)
      })

      await act(async () => {
        await result.current.deleteList('1')
      })

      expect(result.current.lists).toHaveLength(1)
      expect(result.current.lists[0].title).toBe('Will Persist')
      expect(result.current.error).toBe('Delete failed')
    })

    it('does nothing for non-existent list', async () => {
      const { result } = renderHook(() => useLists())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.deleteList('nonexistent')
      })

      expect(mockDelete).not.toHaveBeenCalled()
    })
  })

  describe('reorderLists', () => {
    it('reorders lists by updating sort_order', async () => {
      mockSupabaseData.push(
        createMockDbList({ id: '1', title: 'First', sort_order: 0 }),
        createMockDbList({ id: '2', title: 'Second', sort_order: 1 }),
        createMockDbList({ id: '3', title: 'Third', sort_order: 2 })
      )

      const { result } = renderHook(() => useLists())

      await waitFor(() => {
        expect(result.current.lists).toHaveLength(3)
      })

      await act(async () => {
        await result.current.reorderLists(['3', '1', '2'])
      })

      expect(result.current.lists[0].id).toBe('3')
      expect(result.current.lists[0].sortOrder).toBe(0)
      expect(result.current.lists[1].id).toBe('1')
      expect(result.current.lists[1].sortOrder).toBe(1)
      expect(result.current.lists[2].id).toBe('2')
      expect(result.current.lists[2].sortOrder).toBe(2)
    })

    it('rolls back on error', async () => {
      mockSupabaseData.push(
        createMockDbList({ id: '1', title: 'First', sort_order: 0 }),
        createMockDbList({ id: '2', title: 'Second', sort_order: 1 })
      )
      mockEq.mockResolvedValue({ error: { message: 'Reorder failed' } })

      const { result } = renderHook(() => useLists())

      await waitFor(() => {
        expect(result.current.lists).toHaveLength(2)
      })

      const originalOrder = result.current.lists.map((l) => l.id)

      await act(async () => {
        await result.current.reorderLists(['2', '1'])
      })

      // Should rollback to original order
      expect(result.current.lists.map((l) => l.id)).toEqual(originalOrder)
      expect(result.current.error).toBe('Reorder failed')
    })
  })
})
