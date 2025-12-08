import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { usePinnedItems } from './usePinnedItems'
import { createMockUser, resetIdCounter } from '@/test/mocks/factories'
import type { DbPinnedItem } from '@/types/pin'
import { MAX_PINS } from '@/types/pin'

// Module-level state for mocking
const mockUser = createMockUser()
let mockUserState: ReturnType<typeof createMockUser> | null = mockUser
let mockError: { message: string } | null = null
let mockFetchResult: unknown = null
let mockInsertResult: unknown = null

const mockSelect = vi.fn()
const mockDelete = vi.fn()
const mockInsert = vi.fn()
const mockUpdate = vi.fn()
const mockEq = vi.fn()
const mockIn = vi.fn()
const mockOrder = vi.fn()
const mockSingle = vi.fn()

// Mock useAuth
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUserState }),
}))

// Create chainable mock for select operations
const createSelectChain = () => ({
  eq: (field: string, value: string) => {
    mockEq(field, value)
    return {
      order: (col: string, opts: { ascending: boolean }) => {
        mockOrder(col, opts)
        return Promise.resolve({ data: mockFetchResult, error: mockError })
      },
    }
  },
})

// Create chainable mock for insert operations
const createInsertChain = () => ({
  select: () => {
    mockSelect()
    return {
      single: () => {
        mockSingle()
        return Promise.resolve({ data: mockInsertResult, error: mockError })
      },
    }
  },
})

// Create chainable mock for delete operations
const createDeleteChain = () => ({
  eq: (field: string, value: string) => {
    mockEq(field, value)
    return {
      eq: (field2: string, value2: string) => {
        mockEq(field2, value2)
        return Promise.resolve({ error: mockError })
      },
    }
  },
  in: (field: string, values: string[]) => {
    mockIn(field, values)
    return Promise.resolve({ error: mockError })
  },
})

// Create chainable mock for update operations
const createUpdateChain = () => ({
  eq: (field: string, value: string) => {
    mockEq(field, value)
    return {
      eq: (field2: string, value2: string) => {
        mockEq(field2, value2)
        return Promise.resolve({ error: mockError })
      },
    }
  },
})

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => createSelectChain(),
      insert: (data: unknown) => {
        mockInsert(data)
        return createInsertChain()
      },
      delete: () => {
        mockDelete()
        return createDeleteChain()
      },
      update: (data: unknown) => {
        mockUpdate(data)
        return createUpdateChain()
      },
    }),
  },
}))

// Helper to create a mock DbPinnedItem
function createMockDbPinnedItem(overrides: Partial<DbPinnedItem> = {}): DbPinnedItem {
  return {
    id: 'pin-1',
    user_id: mockUser.id,
    entity_type: 'task',
    entity_id: 'task-1',
    display_order: 0,
    pinned_at: '2024-01-01T00:00:00Z',
    last_accessed_at: new Date().toISOString(), // Recent - not stale
    ...overrides,
  }
}

// Helper to create a stale pin (accessed more than 14 days ago)
function createStalePinnedItem(overrides: Partial<DbPinnedItem> = {}): DbPinnedItem {
  const fifteenDaysAgo = new Date()
  fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15)
  return createMockDbPinnedItem({
    last_accessed_at: fifteenDaysAgo.toISOString(),
    ...overrides,
  })
}

// Helper to create an auto-unpin item (accessed more than 21 days ago)
function createAutoUnpinItem(overrides: Partial<DbPinnedItem> = {}): DbPinnedItem {
  const twentyTwoDaysAgo = new Date()
  twentyTwoDaysAgo.setDate(twentyTwoDaysAgo.getDate() - 22)
  return createMockDbPinnedItem({
    last_accessed_at: twentyTwoDaysAgo.toISOString(),
    ...overrides,
  })
}

describe('usePinnedItems', () => {
  beforeEach(() => {
    resetIdCounter()
    mockError = null
    mockFetchResult = []
    mockInsertResult = null
    mockUserState = mockUser
    vi.clearAllMocks()
  })

  describe('initial state and fetching', () => {
    it('fetches pinned items on mount', async () => {
      const mockPin = createMockDbPinnedItem()
      mockFetchResult = [mockPin]

      const { result } = renderHook(() => usePinnedItems())

      await waitFor(() => {
        expect(result.current.pins).toHaveLength(1)
      })

      expect(mockOrder).toHaveBeenCalledWith('display_order', { ascending: true })
    })

    it('returns empty array when no pins exist', async () => {
      mockFetchResult = []

      const { result } = renderHook(() => usePinnedItems())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.pins).toHaveLength(0)
    })

    it('sorts pins by display_order', async () => {
      mockFetchResult = [
        createMockDbPinnedItem({ id: 'pin-2', entity_id: 'task-2', display_order: 2 }),
        createMockDbPinnedItem({ id: 'pin-1', entity_id: 'task-1', display_order: 1 }),
        createMockDbPinnedItem({ id: 'pin-0', entity_id: 'task-0', display_order: 0 }),
      ]

      const { result } = renderHook(() => usePinnedItems())

      await waitFor(() => {
        expect(result.current.pins).toHaveLength(3)
      })

      // The mock returns data as-is; the hook relies on DB ordering
      expect(mockOrder).toHaveBeenCalledWith('display_order', { ascending: true })
    })

    it('clears pins when user logs out', async () => {
      mockFetchResult = [createMockDbPinnedItem()]

      const { result, rerender } = renderHook(() => usePinnedItems())

      await waitFor(() => {
        expect(result.current.pins).toHaveLength(1)
      })

      // Simulate logout
      mockUserState = null
      rerender()

      await waitFor(() => {
        expect(result.current.pins).toHaveLength(0)
      })
    })
  })

  describe('pin', () => {
    it('pins an item', async () => {
      mockFetchResult = []
      mockInsertResult = createMockDbPinnedItem()

      const { result } = renderHook(() => usePinnedItems())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      let success
      await act(async () => {
        success = await result.current.pin('task', 'task-1')
      })

      expect(success).toBe(true)
      expect(mockInsert).toHaveBeenCalled()
      expect(result.current.pins).toHaveLength(1)
    })

    it('returns true if item is already pinned', async () => {
      mockFetchResult = [createMockDbPinnedItem()]

      const { result } = renderHook(() => usePinnedItems())

      await waitFor(() => {
        expect(result.current.pins).toHaveLength(1)
      })

      let success
      await act(async () => {
        success = await result.current.pin('task', 'task-1')
      })

      expect(success).toBe(true)
      expect(mockInsert).not.toHaveBeenCalled() // Should not call insert
    })

    it('enforces MAX_PINS limit (7)', async () => {
      // Create 7 existing pins
      mockFetchResult = Array.from({ length: MAX_PINS }, (_, i) =>
        createMockDbPinnedItem({
          id: `pin-${i}`,
          entity_id: `task-${i}`,
          display_order: i,
        })
      )

      const { result } = renderHook(() => usePinnedItems())

      await waitFor(() => {
        expect(result.current.pins).toHaveLength(MAX_PINS)
      })

      let success
      await act(async () => {
        success = await result.current.pin('task', 'new-task')
      })

      expect(success).toBe(false)
      expect(result.current.error).toContain(`Maximum of ${MAX_PINS} pins`)
    })

    it('returns false when trying to pin at limit', async () => {
      mockFetchResult = Array.from({ length: MAX_PINS }, (_, i) =>
        createMockDbPinnedItem({
          id: `pin-${i}`,
          entity_id: `task-${i}`,
          display_order: i,
        })
      )

      const { result } = renderHook(() => usePinnedItems())

      await waitFor(() => {
        expect(result.current.pins).toHaveLength(MAX_PINS)
      })

      let success
      await act(async () => {
        success = await result.current.pin('task', 'new-task')
      })

      expect(success).toBe(false)
    })

    it('uses optimistic updates for pin', async () => {
      mockFetchResult = []
      mockInsertResult = createMockDbPinnedItem()

      const { result } = renderHook(() => usePinnedItems())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Start pin but check state immediately
      act(() => {
        result.current.pin('task', 'task-1')
      })

      // Optimistic update should show immediately
      await waitFor(() => {
        expect(result.current.pins).toHaveLength(1)
      })
    })

    it('rolls back on pin failure', async () => {
      mockFetchResult = []
      mockError = { message: 'Insert failed' }

      const { result } = renderHook(() => usePinnedItems())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      await act(async () => {
        await result.current.pin('task', 'task-1')
      })

      // Should have rolled back
      expect(result.current.pins).toHaveLength(0)
      expect(result.current.error).toBe('Insert failed')
    })

    it('returns false when user is not authenticated', async () => {
      mockUserState = null
      mockFetchResult = []

      const { result } = renderHook(() => usePinnedItems())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      let success
      await act(async () => {
        success = await result.current.pin('task', 'task-1')
      })

      expect(success).toBe(false)
      expect(result.current.error).toBe('Must be logged in to pin items')
    })
  })

  describe('unpin', () => {
    it('unpins an item', async () => {
      mockFetchResult = [createMockDbPinnedItem()]

      const { result } = renderHook(() => usePinnedItems())

      await waitFor(() => {
        expect(result.current.pins).toHaveLength(1)
      })

      let success
      await act(async () => {
        success = await result.current.unpin('task', 'task-1')
      })

      expect(success).toBe(true)
      expect(mockDelete).toHaveBeenCalled()
      expect(result.current.pins).toHaveLength(0)
    })

    it('unpins by entity type and id', async () => {
      mockFetchResult = [
        createMockDbPinnedItem({ id: 'pin-1', entity_type: 'task', entity_id: 'task-1' }),
        createMockDbPinnedItem({ id: 'pin-2', entity_type: 'project', entity_id: 'project-1' }),
      ]

      const { result } = renderHook(() => usePinnedItems())

      await waitFor(() => {
        expect(result.current.pins).toHaveLength(2)
      })

      await act(async () => {
        await result.current.unpin('task', 'task-1')
      })

      expect(result.current.pins).toHaveLength(1)
      expect(result.current.pins[0].entityType).toBe('project')
    })

    it('returns true if item is not pinned', async () => {
      mockFetchResult = []

      const { result } = renderHook(() => usePinnedItems())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      let success
      await act(async () => {
        success = await result.current.unpin('task', 'non-existent')
      })

      expect(success).toBe(true)
      expect(mockDelete).not.toHaveBeenCalled()
    })

    it('uses optimistic updates for unpin', async () => {
      mockFetchResult = [createMockDbPinnedItem()]

      const { result } = renderHook(() => usePinnedItems())

      await waitFor(() => {
        expect(result.current.pins).toHaveLength(1)
      })

      // Start unpin
      act(() => {
        result.current.unpin('task', 'task-1')
      })

      // Should be removed immediately
      await waitFor(() => {
        expect(result.current.pins).toHaveLength(0)
      })
    })

    it('rolls back on unpin failure', async () => {
      mockFetchResult = [createMockDbPinnedItem()]

      const { result } = renderHook(() => usePinnedItems())

      await waitFor(() => {
        expect(result.current.pins).toHaveLength(1)
      })

      mockError = { message: 'Delete failed' }

      await act(async () => {
        await result.current.unpin('task', 'task-1')
      })

      // Should have rolled back
      expect(result.current.pins).toHaveLength(1)
      expect(result.current.error).toBe('Delete failed')
    })
  })

  describe('queries', () => {
    it('isPinned returns true for pinned items', async () => {
      mockFetchResult = [createMockDbPinnedItem()]

      const { result } = renderHook(() => usePinnedItems())

      await waitFor(() => {
        expect(result.current.pins).toHaveLength(1)
      })

      expect(result.current.isPinned('task', 'task-1')).toBe(true)
    })

    it('isPinned returns false for unpinned items', async () => {
      mockFetchResult = [createMockDbPinnedItem()]

      const { result } = renderHook(() => usePinnedItems())

      await waitFor(() => {
        expect(result.current.pins).toHaveLength(1)
      })

      expect(result.current.isPinned('task', 'non-existent')).toBe(false)
    })

    it('canPin returns true when under limit', async () => {
      mockFetchResult = [createMockDbPinnedItem()]

      const { result } = renderHook(() => usePinnedItems())

      await waitFor(() => {
        expect(result.current.pins).toHaveLength(1)
      })

      expect(result.current.canPin()).toBe(true)
    })

    it('canPin returns false when at limit', async () => {
      mockFetchResult = Array.from({ length: MAX_PINS }, (_, i) =>
        createMockDbPinnedItem({
          id: `pin-${i}`,
          entity_id: `task-${i}`,
          display_order: i,
        })
      )

      const { result } = renderHook(() => usePinnedItems())

      await waitFor(() => {
        expect(result.current.pins).toHaveLength(MAX_PINS)
      })

      expect(result.current.canPin()).toBe(false)
    })
  })

  describe('access tracking', () => {
    it('markAccessed updates lastAccessedAt', async () => {
      mockFetchResult = [createMockDbPinnedItem()]

      const { result } = renderHook(() => usePinnedItems())

      await waitFor(() => {
        expect(result.current.pins).toHaveLength(1)
      })

      const originalLastAccessed = result.current.pins[0].lastAccessedAt

      await act(async () => {
        await result.current.markAccessed('task', 'task-1')
      })

      expect(result.current.pins[0].lastAccessedAt.getTime()).toBeGreaterThanOrEqual(
        originalLastAccessed.getTime()
      )
      expect(mockUpdate).toHaveBeenCalled()
    })

    it('refreshStale resets lastAccessedAt', async () => {
      mockFetchResult = [createStalePinnedItem()]

      const { result } = renderHook(() => usePinnedItems())

      await waitFor(() => {
        expect(result.current.pins).toHaveLength(1)
      })

      expect(result.current.pins[0].isStale).toBe(true)

      await act(async () => {
        await result.current.refreshStale(result.current.pins[0].id)
      })

      expect(result.current.pins[0].isStale).toBe(false)
      expect(mockUpdate).toHaveBeenCalled()
    })
  })

  describe('stale logic', () => {
    it('computes isStale=true after 14 days without access', async () => {
      mockFetchResult = [createStalePinnedItem()]

      const { result } = renderHook(() => usePinnedItems())

      await waitFor(() => {
        expect(result.current.pins).toHaveLength(1)
      })

      expect(result.current.pins[0].isStale).toBe(true)
    })

    it('computes isStale=false for recently accessed items', async () => {
      mockFetchResult = [createMockDbPinnedItem()] // lastAccessedAt is now

      const { result } = renderHook(() => usePinnedItems())

      await waitFor(() => {
        expect(result.current.pins).toHaveLength(1)
      })

      expect(result.current.pins[0].isStale).toBe(false)
    })

    it('auto-unpins items older than 21 days on load', async () => {
      mockFetchResult = [
        createMockDbPinnedItem({ id: 'recent', entity_id: 'task-recent' }),
        createAutoUnpinItem({ id: 'old', entity_id: 'task-old' }),
      ]

      const { result } = renderHook(() => usePinnedItems())

      await waitFor(() => {
        // Only the recent pin should remain
        expect(result.current.pins).toHaveLength(1)
      })

      expect(result.current.pins[0].entityId).toBe('task-recent')
      expect(mockIn).toHaveBeenCalledWith('id', ['old'])
    })
  })

  describe('reorder', () => {
    it('reorder updates display_order for all items', async () => {
      mockFetchResult = [
        createMockDbPinnedItem({ id: 'pin-0', entity_id: 'task-0', display_order: 0 }),
        createMockDbPinnedItem({ id: 'pin-1', entity_id: 'task-1', display_order: 1 }),
        createMockDbPinnedItem({ id: 'pin-2', entity_id: 'task-2', display_order: 2 }),
      ]

      const { result } = renderHook(() => usePinnedItems())

      await waitFor(() => {
        expect(result.current.pins).toHaveLength(3)
      })

      // Reorder: move pin-2 to front
      await act(async () => {
        await result.current.reorder(['pin-2', 'pin-0', 'pin-1'])
      })

      expect(mockUpdate).toHaveBeenCalledTimes(3)
      expect(result.current.pins[0].id).toBe('pin-2')
      expect(result.current.pins[0].displayOrder).toBe(0)
    })

    it('rolls back reorder on failure', async () => {
      mockFetchResult = [
        createMockDbPinnedItem({ id: 'pin-0', entity_id: 'task-0', display_order: 0 }),
        createMockDbPinnedItem({ id: 'pin-1', entity_id: 'task-1', display_order: 1 }),
      ]

      const { result } = renderHook(() => usePinnedItems())

      await waitFor(() => {
        expect(result.current.pins).toHaveLength(2)
      })

      mockError = { message: 'Update failed' }

      await act(async () => {
        await result.current.reorder(['pin-1', 'pin-0'])
      })

      // Should have rolled back to original order
      expect(result.current.pins[0].id).toBe('pin-0')
      expect(result.current.error).toBe('Failed to reorder pins')
    })
  })
})
