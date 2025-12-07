import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useListItems } from './useListItems'
import type { DbListItem } from '@/types/list'

// Mock Supabase data
const mockSupabaseData: DbListItem[] = []

// Create mock functions
const mockOrder = vi.fn()
const mockInsert = vi.fn()
const mockUpdate = vi.fn()
const mockDelete = vi.fn()
const mockSingle = vi.fn()
const mockEq = vi.fn()
const mockEqListId = vi.fn()

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
        eq: (field: string, value: string) => {
          mockEqListId(field, value)
          return {
            order: () => ({
              order: () => mockOrder(),
            }),
          }
        },
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

function createMockDbListItem(overrides: Partial<DbListItem> = {}): DbListItem {
  return {
    id: 'item-1',
    user_id: 'test-user-id',
    list_id: 'list-1',
    text: 'Test Item',
    note: null,
    sort_order: 0,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('useListItems', () => {
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
    it('starts with empty items and loading state', async () => {
      const { result } = renderHook(() => useListItems('list-1'))

      expect(result.current.loading).toBe(true)

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.items).toEqual([])
      expect(result.current.error).toBeNull()
    })

    it('fetches items for specific list', async () => {
      mockSupabaseData.push(createMockDbListItem({ list_id: 'list-1' }))

      const { result } = renderHook(() => useListItems('list-1'))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(mockEqListId).toHaveBeenCalledWith('list_id', 'list-1')
      expect(result.current.items).toHaveLength(1)
      expect(result.current.items[0].text).toBe('Test Item')
    })

    it('converts snake_case fields to camelCase', async () => {
      mockSupabaseData.push(
        createMockDbListItem({
          list_id: 'list-123',
          sort_order: 5,
          created_at: '2024-06-15T10:30:00Z',
          updated_at: '2024-06-15T11:45:00Z',
        })
      )

      const { result } = renderHook(() => useListItems('list-1'))

      await waitFor(() => {
        expect(result.current.items).toHaveLength(1)
      })

      const item = result.current.items[0]
      expect(item.listId).toBe('list-123')
      expect(item.sortOrder).toBe(5)
      expect(item.createdAt).toBeInstanceOf(Date)
      expect(item.updatedAt).toBeInstanceOf(Date)
    })

    it('clears items when listId is null', async () => {
      const { result } = renderHook(() => useListItems(null))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.items).toEqual([])
    })

    it('clears items when user is null', async () => {
      mockUser = null

      const { result } = renderHook(() => useListItems('list-1'))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.items).toEqual([])
    })

    it('refetches when listId changes', async () => {
      mockSupabaseData.push(createMockDbListItem({ id: '1', list_id: 'list-1', text: 'Item 1' }))

      const { result, rerender } = renderHook(({ listId }) => useListItems(listId), {
        initialProps: { listId: 'list-1' },
      })

      await waitFor(() => {
        expect(result.current.items).toHaveLength(1)
      })

      // Change data for new list
      mockSupabaseData.length = 0
      mockSupabaseData.push(createMockDbListItem({ id: '2', list_id: 'list-2', text: 'Item 2' }))

      rerender({ listId: 'list-2' })

      await waitFor(() => {
        expect(mockEqListId).toHaveBeenCalledWith('list_id', 'list-2')
      })
    })
  })

  describe('itemCount', () => {
    it('returns correct item count', async () => {
      mockSupabaseData.push(
        createMockDbListItem({ id: '1' }),
        createMockDbListItem({ id: '2' }),
        createMockDbListItem({ id: '3' })
      )

      const { result } = renderHook(() => useListItems('list-1'))

      await waitFor(() => {
        expect(result.current.itemCount).toBe(3)
      })
    })

    it('returns 0 when no items', async () => {
      const { result } = renderHook(() => useListItems('list-1'))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.itemCount).toBe(0)
    })
  })

  describe('getItemById', () => {
    it('returns item by ID', async () => {
      mockSupabaseData.push(
        createMockDbListItem({ id: 'item-1', text: 'First' }),
        createMockDbListItem({ id: 'item-2', text: 'Second' })
      )

      const { result } = renderHook(() => useListItems('list-1'))

      await waitFor(() => {
        expect(result.current.items).toHaveLength(2)
      })

      const item = result.current.getItemById('item-2')
      expect(item).toBeDefined()
      expect(item?.text).toBe('Second')
    })

    it('returns undefined for non-existent ID', async () => {
      mockSupabaseData.push(createMockDbListItem({ id: 'item-1' }))

      const { result } = renderHook(() => useListItems('list-1'))

      await waitFor(() => {
        expect(result.current.items).toHaveLength(1)
      })

      const item = result.current.getItemById('nonexistent')
      expect(item).toBeUndefined()
    })
  })

  describe('searchItems', () => {
    it('searches items by text (case-insensitive)', async () => {
      mockSupabaseData.push(
        createMockDbListItem({ id: '1', text: 'Inception' }),
        createMockDbListItem({ id: '2', text: 'The Matrix' }),
        createMockDbListItem({ id: '3', text: 'INCEPTION Returns' })
      )

      const { result } = renderHook(() => useListItems('list-1'))

      await waitFor(() => {
        expect(result.current.items).toHaveLength(3)
      })

      const matches = result.current.searchItems('inception')
      expect(matches).toHaveLength(2)
    })

    it('searches items by note', async () => {
      mockSupabaseData.push(
        createMockDbListItem({ id: '1', text: 'Item 1', note: 'Great movie' }),
        createMockDbListItem({ id: '2', text: 'Item 2', note: null }),
        createMockDbListItem({ id: '3', text: 'Item 3', note: 'Another great one' })
      )

      const { result } = renderHook(() => useListItems('list-1'))

      await waitFor(() => {
        expect(result.current.items).toHaveLength(3)
      })

      const matches = result.current.searchItems('great')
      expect(matches).toHaveLength(2)
    })

    it('returns all items when query is empty', async () => {
      mockSupabaseData.push(
        createMockDbListItem({ id: '1', text: 'Item 1' }),
        createMockDbListItem({ id: '2', text: 'Item 2' })
      )

      const { result } = renderHook(() => useListItems('list-1'))

      await waitFor(() => {
        expect(result.current.items).toHaveLength(2)
      })

      const matches = result.current.searchItems('')
      expect(matches).toHaveLength(2)
    })

    it('returns empty array when no matches', async () => {
      mockSupabaseData.push(createMockDbListItem({ id: '1', text: 'Movies' }))

      const { result } = renderHook(() => useListItems('list-1'))

      await waitFor(() => {
        expect(result.current.items).toHaveLength(1)
      })

      const matches = result.current.searchItems('xyz')
      expect(matches).toHaveLength(0)
    })
  })

  describe('itemsMap', () => {
    it('provides efficient lookup by ID', async () => {
      mockSupabaseData.push(
        createMockDbListItem({ id: 'item-1', text: 'First' }),
        createMockDbListItem({ id: 'item-2', text: 'Second' })
      )

      const { result } = renderHook(() => useListItems('list-1'))

      await waitFor(() => {
        expect(result.current.items).toHaveLength(2)
      })

      expect(result.current.itemsMap.get('item-1')?.text).toBe('First')
      expect(result.current.itemsMap.get('item-2')?.text).toBe('Second')
      expect(result.current.itemsMap.get('nonexistent')).toBeUndefined()
    })
  })

  describe('addItem', () => {
    it('creates item with optimistic update', async () => {
      const newItem = createMockDbListItem({ id: 'new-id', text: 'New Item' })
      mockSingle.mockResolvedValue({ data: newItem, error: null })

      const { result } = renderHook(() => useListItems('list-1'))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      let createdItem = null
      await act(async () => {
        createdItem = await result.current.addItem({ text: 'New Item' })
      })

      expect(createdItem).not.toBeNull()
      expect(result.current.items).toHaveLength(1)
      expect(result.current.items[0].text).toBe('New Item')
    })

    it('includes note when provided', async () => {
      const newItem = createMockDbListItem({ id: 'new-id', text: 'Test', note: 'My note' })
      mockSingle.mockResolvedValue({ data: newItem, error: null })

      const { result } = renderHook(() => useListItems('list-1'))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.addItem({ text: 'Test', note: 'My note' })
      })

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Test',
          note: 'My note',
        })
      )
    })

    it('calculates correct sort order', async () => {
      mockSupabaseData.push(
        createMockDbListItem({ id: '1', sort_order: 0 }),
        createMockDbListItem({ id: '2', sort_order: 5 }),
        createMockDbListItem({ id: '3', sort_order: 3 })
      )

      const newItem = createMockDbListItem({ id: 'new', text: 'New', sort_order: 6 })
      mockSingle.mockResolvedValue({ data: newItem, error: null })

      const { result } = renderHook(() => useListItems('list-1'))

      await waitFor(() => {
        expect(result.current.items).toHaveLength(3)
      })

      await act(async () => {
        await result.current.addItem({ text: 'New' })
      })

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          sort_order: 6, // max(0,5,3) + 1 = 6
        })
      )
    })

    it('rolls back on error', async () => {
      mockSingle.mockResolvedValue({ data: null, error: { message: 'Insert failed' } })

      const { result } = renderHook(() => useListItems('list-1'))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        const createdItem = await result.current.addItem({ text: 'Will Fail' })
        expect(createdItem).toBeNull()
      })

      expect(result.current.items).toHaveLength(0)
      expect(result.current.error).toBe('Insert failed')
    })

    it('returns null when user is not authenticated', async () => {
      mockUser = null

      const { result } = renderHook(() => useListItems('list-1'))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        const createdItem = await result.current.addItem({ text: 'Test' })
        expect(createdItem).toBeNull()
      })
    })

    it('returns null when listId is null', async () => {
      const { result } = renderHook(() => useListItems(null))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        const createdItem = await result.current.addItem({ text: 'Test' })
        expect(createdItem).toBeNull()
      })
    })
  })

  describe('updateItem', () => {
    it('updates item with optimistic update', async () => {
      mockSupabaseData.push(createMockDbListItem({ id: '1', text: 'Original' }))

      const { result } = renderHook(() => useListItems('list-1'))

      await waitFor(() => {
        expect(result.current.items).toHaveLength(1)
      })

      await act(async () => {
        await result.current.updateItem('1', { text: 'Updated' })
      })

      expect(result.current.items[0].text).toBe('Updated')
    })

    it('handles partial updates', async () => {
      mockSupabaseData.push(
        createMockDbListItem({
          id: '1',
          text: 'Original',
          note: 'Original note',
          sort_order: 5,
        })
      )

      const { result } = renderHook(() => useListItems('list-1'))

      await waitFor(() => {
        expect(result.current.items).toHaveLength(1)
      })

      await act(async () => {
        await result.current.updateItem('1', { text: 'New Text' })
      })

      expect(result.current.items[0].text).toBe('New Text')
      expect(result.current.items[0].note).toBe('Original note')
      expect(result.current.items[0].sortOrder).toBe(5)
    })

    it('converts camelCase to snake_case for DB', async () => {
      mockSupabaseData.push(createMockDbListItem({ id: '1' }))

      const { result } = renderHook(() => useListItems('list-1'))

      await waitFor(() => {
        expect(result.current.items).toHaveLength(1)
      })

      await act(async () => {
        await result.current.updateItem('1', { sortOrder: 10 })
      })

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          sort_order: 10,
        })
      )
    })

    it('rolls back on error', async () => {
      mockSupabaseData.push(createMockDbListItem({ id: '1', text: 'Original' }))
      mockEq.mockResolvedValue({ error: { message: 'Update failed' } })

      const { result } = renderHook(() => useListItems('list-1'))

      await waitFor(() => {
        expect(result.current.items).toHaveLength(1)
      })

      await act(async () => {
        await result.current.updateItem('1', { text: 'Will Fail' })
      })

      expect(result.current.items[0].text).toBe('Original')
      expect(result.current.error).toBe('Update failed')
    })

    it('does nothing for non-existent item', async () => {
      const { result } = renderHook(() => useListItems('list-1'))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.updateItem('nonexistent', { text: 'Test' })
      })

      expect(mockUpdate).not.toHaveBeenCalled()
    })
  })

  describe('deleteItem', () => {
    it('deletes item with optimistic update', async () => {
      mockSupabaseData.push(createMockDbListItem({ id: '1' }))

      const { result } = renderHook(() => useListItems('list-1'))

      await waitFor(() => {
        expect(result.current.items).toHaveLength(1)
      })

      await act(async () => {
        await result.current.deleteItem('1')
      })

      expect(result.current.items).toHaveLength(0)
    })

    it('rolls back on error and maintains sort order', async () => {
      mockSupabaseData.push(
        createMockDbListItem({ id: '1', text: 'First', sort_order: 0 }),
        createMockDbListItem({ id: '2', text: 'Second', sort_order: 1 })
      )
      mockDelete.mockResolvedValue({ error: { message: 'Delete failed' } })

      const { result } = renderHook(() => useListItems('list-1'))

      await waitFor(() => {
        expect(result.current.items).toHaveLength(2)
      })

      await act(async () => {
        await result.current.deleteItem('1')
      })

      expect(result.current.items).toHaveLength(2)
      expect(result.current.items[0].text).toBe('First')
      expect(result.current.error).toBe('Delete failed')
    })

    it('does nothing for non-existent item', async () => {
      const { result } = renderHook(() => useListItems('list-1'))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.deleteItem('nonexistent')
      })

      expect(mockDelete).not.toHaveBeenCalled()
    })
  })

  describe('reorderItems', () => {
    it('reorders items by updating sort_order', async () => {
      mockSupabaseData.push(
        createMockDbListItem({ id: '1', text: 'First', sort_order: 0 }),
        createMockDbListItem({ id: '2', text: 'Second', sort_order: 1 }),
        createMockDbListItem({ id: '3', text: 'Third', sort_order: 2 })
      )

      const { result } = renderHook(() => useListItems('list-1'))

      await waitFor(() => {
        expect(result.current.items).toHaveLength(3)
      })

      await act(async () => {
        await result.current.reorderItems(['3', '1', '2'])
      })

      expect(result.current.items[0].id).toBe('3')
      expect(result.current.items[0].sortOrder).toBe(0)
      expect(result.current.items[1].id).toBe('1')
      expect(result.current.items[1].sortOrder).toBe(1)
      expect(result.current.items[2].id).toBe('2')
      expect(result.current.items[2].sortOrder).toBe(2)
    })

    it('rolls back on error', async () => {
      mockSupabaseData.push(
        createMockDbListItem({ id: '1', text: 'First', sort_order: 0 }),
        createMockDbListItem({ id: '2', text: 'Second', sort_order: 1 })
      )
      mockEq.mockResolvedValue({ error: { message: 'Reorder failed' } })

      const { result } = renderHook(() => useListItems('list-1'))

      await waitFor(() => {
        expect(result.current.items).toHaveLength(2)
      })

      const originalOrder = result.current.items.map((i) => i.id)

      await act(async () => {
        await result.current.reorderItems(['2', '1'])
      })

      // Should rollback to original order
      expect(result.current.items.map((i) => i.id)).toEqual(originalOrder)
      expect(result.current.error).toBe('Reorder failed')
    })
  })
})
