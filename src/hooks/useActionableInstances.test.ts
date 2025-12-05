import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useActionableInstances } from './useActionableInstances'
import { createMockUser, createMockActionableInstance, resetIdCounter } from '@/test/mocks/factories'
import type { ActionableInstance, InstanceNote, CoverageRequest } from '@/types/actionable'

// Module-level state for mocking
const mockUser = createMockUser()
let mockUserState: ReturnType<typeof createMockUser> | null = mockUser
let mockError: { message: string } | null = null
let mockFetchResult: unknown = null
let mockInsertResult: unknown = null
let mockUpdateError: { message: string } | null = null
const mockSelect = vi.fn()
const mockInsert = vi.fn()
const mockUpdate = vi.fn()
const mockDelete = vi.fn()
const mockEq = vi.fn()
const mockSingle = vi.fn()
const mockOrder = vi.fn()

// Create a recursive eq chain builder
const createEqChain = (depth: number = 0): unknown => ({
  eq: (field: string, value: string) => {
    mockEq(field, value)
    if (depth < 4) {
      return createEqChain(depth + 1)
    }
    return {
      single: () => {
        mockSingle()
        return Promise.resolve({ data: mockFetchResult, error: mockError })
      },
    }
  },
  single: () => {
    mockSingle()
    return Promise.resolve({ data: mockFetchResult, error: mockError })
  },
  order: (field: string, options: unknown) => {
    mockOrder(field, options)
    return Promise.resolve({ data: mockFetchResult, error: mockError })
  },
  // Also need direct Promise resolution for queries without further chaining
  then: (resolve: (val: unknown) => void) => {
    return Promise.resolve({ data: mockFetchResult, error: mockError }).then(resolve)
  },
})

// Mock Supabase auth
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(() =>
        Promise.resolve({
          data: { user: mockUserState },
          error: null
        })
      ),
    },
    from: (table: string) => ({
      select: () => {
        mockSelect(table)
        return createEqChain()
      },
      insert: (data: unknown) => {
        mockInsert(data)
        return {
          select: () => ({
            single: () => Promise.resolve({ data: mockInsertResult, error: mockError }),
          }),
        }
      },
      update: (data: unknown) => {
        mockUpdate(data)
        return {
          eq: (field: string, value: string) => {
            mockEq(field, value)
            return Promise.resolve({ error: mockUpdateError })
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

describe('useActionableInstances', () => {
  beforeEach(() => {
    resetIdCounter()
    mockError = null
    mockUpdateError = null
    mockFetchResult = null
    mockInsertResult = null
    mockUserState = mockUser
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('starts with isLoading=false', () => {
      const { result } = renderHook(() => useActionableInstances())
      expect(result.current.isLoading).toBe(false)
    })

    it('starts with no error', () => {
      const { result } = renderHook(() => useActionableInstances())
      expect(result.current.error).toBeNull()
    })
  })

  describe('getInstance', () => {
    it('fetches an existing instance', async () => {
      const mockInstance = createMockActionableInstance({
        id: 'inst-1',
        entity_id: 'routine-1',
        date: '2024-01-15',
      })
      mockFetchResult = mockInstance

      const { result } = renderHook(() => useActionableInstances())

      let instance: ActionableInstance | null = null

      await act(async () => {
        instance = await result.current.getInstance('routine', 'routine-1', new Date('2024-01-15'))
      })

      expect(instance).not.toBeNull()
      expect(instance!.id).toBe('inst-1')
    })

    it('returns null when user is not authenticated', async () => {
      mockUserState = null

      const { result } = renderHook(() => useActionableInstances())

      let instance

      await act(async () => {
        instance = await result.current.getInstance('routine', 'routine-1', new Date('2024-01-15'))
      })

      expect(instance).toBeNull()
    })

    it('returns null when instance does not exist', async () => {
      mockFetchResult = null
      mockError = { message: 'No rows' }

      const { result } = renderHook(() => useActionableInstances())

      let instance

      await act(async () => {
        instance = await result.current.getInstance('routine', 'routine-1', new Date('2024-01-15'))
      })

      expect(instance).toBeNull()
    })
  })

  describe('getOrCreateInstance', () => {
    it('returns existing instance if found', async () => {
      const mockInstance = createMockActionableInstance({
        id: 'inst-1',
        entity_id: 'routine-1',
        date: '2024-01-15',
      })
      mockFetchResult = mockInstance

      const { result } = renderHook(() => useActionableInstances())

      let instance: ActionableInstance | null = null

      await act(async () => {
        instance = await result.current.getOrCreateInstance('routine', 'routine-1', new Date('2024-01-15'))
      })

      expect(instance).not.toBeNull()
      expect(instance!.id).toBe('inst-1')
      expect(mockInsert).not.toHaveBeenCalled()
    })

    it('creates new instance if not found', async () => {
      mockFetchResult = null
      mockError = { message: 'No rows' }

      const newInstance = createMockActionableInstance({
        id: 'new-inst',
        entity_id: 'routine-1',
        date: '2024-01-15',
        status: 'pending',
      })
      mockInsertResult = newInstance

      // Reset mockError after the fetch so insert succeeds
      const { result } = renderHook(() => useActionableInstances())

      // Need to adjust mock behavior
      vi.clearAllMocks()
      mockFetchResult = null
      mockError = null
      mockInsertResult = newInstance

      await act(async () => {
        await result.current.getOrCreateInstance('routine', 'routine-1', new Date('2024-01-15'))
      })

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: mockUser.id,
          entity_type: 'routine',
          entity_id: 'routine-1',
          status: 'pending',
        })
      )
    })

    it('returns null when user is not authenticated', async () => {
      mockUserState = null

      const { result } = renderHook(() => useActionableInstances())

      let instance

      await act(async () => {
        instance = await result.current.getOrCreateInstance('routine', 'routine-1', new Date('2024-01-15'))
      })

      expect(instance).toBeNull()
    })
  })

  describe('getInstancesForDate', () => {
    it('fetches all instances for a date', async () => {
      const instances = [
        createMockActionableInstance({ id: 'inst-1', date: '2024-01-15' }),
        createMockActionableInstance({ id: 'inst-2', date: '2024-01-15' }),
      ]
      mockFetchResult = instances
      mockError = null

      const { result } = renderHook(() => useActionableInstances())

      let fetched: ActionableInstance[] = []

      await act(async () => {
        fetched = await result.current.getInstancesForDate(new Date('2024-01-15'))
      })

      expect(fetched).toHaveLength(2)
    })

    it('returns empty array when user is not authenticated', async () => {
      mockUserState = null

      const { result } = renderHook(() => useActionableInstances())

      let fetched: ActionableInstance[] = []

      await act(async () => {
        fetched = await result.current.getInstancesForDate(new Date('2024-01-15'))
      })

      expect(fetched).toHaveLength(0)
    })

    it('returns empty array on error', async () => {
      mockError = { message: 'Database error' }

      const { result } = renderHook(() => useActionableInstances())

      let fetched: ActionableInstance[] = []

      await act(async () => {
        fetched = await result.current.getInstancesForDate(new Date('2024-01-15'))
      })

      expect(fetched).toHaveLength(0)
    })
  })

  describe('markDone', () => {
    it('marks instance as completed', async () => {
      const mockInstance = createMockActionableInstance({ id: 'inst-1' })
      mockFetchResult = mockInstance

      const { result } = renderHook(() => useActionableInstances())

      let success

      await act(async () => {
        success = await result.current.markDone('routine', 'routine-1', new Date('2024-01-15'))
      })

      expect(success).toBe(true)
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
        })
      )
    })

    it('sets loading while marking done', async () => {
      const mockInstance = createMockActionableInstance({ id: 'inst-1' })
      mockFetchResult = mockInstance

      const { result } = renderHook(() => useActionableInstances())

      act(() => {
        result.current.markDone('routine', 'routine-1', new Date('2024-01-15'))
      })

      expect(result.current.isLoading).toBe(true)

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })
    })

    it('returns false on error', async () => {
      mockFetchResult = null

      const { result } = renderHook(() => useActionableInstances())

      let success

      await act(async () => {
        success = await result.current.markDone('routine', 'routine-1', new Date('2024-01-15'))
      })

      expect(success).toBe(false)
      expect(result.current.error).not.toBeNull()
    })
  })

  describe('undoDone', () => {
    it('marks instance as pending', async () => {
      const mockInstance = createMockActionableInstance({
        id: 'inst-1',
        status: 'completed',
      })
      mockFetchResult = mockInstance

      const { result } = renderHook(() => useActionableInstances())

      let success

      await act(async () => {
        success = await result.current.undoDone('routine', 'routine-1', new Date('2024-01-15'))
      })

      expect(success).toBe(true)
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'pending',
          completed_at: null,
        })
      )
    })

    it('returns true when no instance exists', async () => {
      mockFetchResult = null
      mockError = { message: 'No rows' }

      const { result } = renderHook(() => useActionableInstances())

      let success

      await act(async () => {
        success = await result.current.undoDone('routine', 'routine-1', new Date('2024-01-15'))
      })

      expect(success).toBe(true) // Already not done
    })
  })

  describe('skip', () => {
    it('marks instance as skipped', async () => {
      const mockInstance = createMockActionableInstance({ id: 'inst-1' })
      mockFetchResult = mockInstance

      const { result } = renderHook(() => useActionableInstances())

      let success

      await act(async () => {
        success = await result.current.skip('routine', 'routine-1', new Date('2024-01-15'))
      })

      expect(success).toBe(true)
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'skipped',
        })
      )
    })

    it('returns false on error', async () => {
      mockFetchResult = null

      const { result } = renderHook(() => useActionableInstances())

      let success

      await act(async () => {
        success = await result.current.skip('routine', 'routine-1', new Date('2024-01-15'))
      })

      expect(success).toBe(false)
    })
  })

  describe('defer', () => {
    it('marks instance as deferred with target date', async () => {
      const mockInstance = createMockActionableInstance({ id: 'inst-1' })
      mockFetchResult = mockInstance

      const { result } = renderHook(() => useActionableInstances())

      const targetDate = new Date('2024-01-20T10:00:00Z')
      let success

      await act(async () => {
        success = await result.current.defer('routine', 'routine-1', new Date('2024-01-15'), targetDate)
      })

      expect(success).toBe(true)
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'deferred',
          deferred_to: targetDate.toISOString(),
        })
      )
    })

    it('returns false on error', async () => {
      mockFetchResult = null

      const { result } = renderHook(() => useActionableInstances())

      let success

      await act(async () => {
        success = await result.current.defer('routine', 'routine-1', new Date('2024-01-15'), new Date('2024-01-20'))
      })

      expect(success).toBe(false)
    })
  })

  describe('getNotes', () => {
    it('fetches notes for an instance', async () => {
      const mockNotes: InstanceNote[] = [
        { id: 'note-1', instance_id: 'inst-1', user_id: mockUser.id, note: 'Note 1', created_at: '2024-01-01T00:00:00Z' },
        { id: 'note-2', instance_id: 'inst-1', user_id: mockUser.id, note: 'Note 2', created_at: '2024-01-02T00:00:00Z' },
      ]
      mockFetchResult = mockNotes

      const { result } = renderHook(() => useActionableInstances())

      let notes: InstanceNote[] = []

      await act(async () => {
        notes = await result.current.getNotes('inst-1')
      })

      expect(notes).toHaveLength(2)
    })

    it('returns empty array on error', async () => {
      mockError = { message: 'Database error' }

      const { result } = renderHook(() => useActionableInstances())

      let notes: InstanceNote[] = []

      await act(async () => {
        notes = await result.current.getNotes('inst-1')
      })

      expect(notes).toHaveLength(0)
    })
  })

  describe('addNote', () => {
    it('adds a note to an instance', async () => {
      const mockInstance = createMockActionableInstance({ id: 'inst-1' })
      mockFetchResult = mockInstance

      const newNote: InstanceNote = {
        id: 'new-note',
        instance_id: 'inst-1',
        user_id: mockUser.id,
        note: 'Test note',
        created_at: '2024-01-01T00:00:00Z',
      }
      mockInsertResult = newNote

      const { result } = renderHook(() => useActionableInstances())

      let addedNote: InstanceNote | null = null

      await act(async () => {
        addedNote = await result.current.addNote('routine', 'routine-1', new Date('2024-01-15'), 'Test note')
      })

      expect(addedNote).not.toBeNull()
      expect(addedNote!.note).toBe('Test note')
    })

    it('returns null when user is not authenticated', async () => {
      mockUserState = null

      const { result } = renderHook(() => useActionableInstances())

      let addedNote

      await act(async () => {
        addedNote = await result.current.addNote('routine', 'routine-1', new Date('2024-01-15'), 'Test note')
      })

      expect(addedNote).toBeNull()
    })
  })

  describe('deleteNote', () => {
    it('deletes a note', async () => {
      const { result } = renderHook(() => useActionableInstances())

      let success

      await act(async () => {
        success = await result.current.deleteNote('note-1')
      })

      expect(success).toBe(true)
      expect(mockDelete).toHaveBeenCalled()
    })

    it('returns false on error', async () => {
      mockError = { message: 'Delete failed' }

      const { result } = renderHook(() => useActionableInstances())

      let success

      await act(async () => {
        success = await result.current.deleteNote('note-1')
      })

      expect(success).toBe(false)
    })
  })

  describe('requestCoverage', () => {
    it('creates a coverage request', async () => {
      const mockInstance = createMockActionableInstance({ id: 'inst-1' })
      mockFetchResult = mockInstance

      const newRequest: CoverageRequest = {
        id: 'req-1',
        instance_id: 'inst-1',
        requested_by: mockUser.id,
        covered_by: null,
        status: 'pending',
        requested_at: '2024-01-01T00:00:00Z',
        responded_at: null,
      }
      mockInsertResult = newRequest

      const { result } = renderHook(() => useActionableInstances())

      let request: CoverageRequest | null = null

      await act(async () => {
        request = await result.current.requestCoverage('routine', 'routine-1', new Date('2024-01-15'))
      })

      expect(request).not.toBeNull()
      expect(request!.status).toBe('pending')
    })

    it('returns null when user is not authenticated', async () => {
      mockUserState = null

      const { result } = renderHook(() => useActionableInstances())

      let request

      await act(async () => {
        request = await result.current.requestCoverage('routine', 'routine-1', new Date('2024-01-15'))
      })

      expect(request).toBeNull()
    })
  })

  describe('getCoverageRequests', () => {
    it('fetches coverage requests for an instance', async () => {
      const requests: CoverageRequest[] = [
        { id: 'req-1', instance_id: 'inst-1', requested_by: mockUser.id, covered_by: null, status: 'pending', requested_at: '2024-01-01T00:00:00Z', responded_at: null },
      ]
      mockFetchResult = requests

      const { result } = renderHook(() => useActionableInstances())

      let fetched: CoverageRequest[] = []

      await act(async () => {
        fetched = await result.current.getCoverageRequests('inst-1')
      })

      expect(fetched).toHaveLength(1)
    })

    it('returns empty array on error', async () => {
      mockError = { message: 'Database error' }

      const { result } = renderHook(() => useActionableInstances())

      let fetched: CoverageRequest[] = []

      await act(async () => {
        fetched = await result.current.getCoverageRequests('inst-1')
      })

      expect(fetched).toHaveLength(0)
    })
  })

  describe('respondToCoverage', () => {
    it('accepts coverage request', async () => {
      mockFetchResult = { instance_id: 'inst-1' }

      const { result } = renderHook(() => useActionableInstances())

      let success

      await act(async () => {
        success = await result.current.respondToCoverage('req-1', true)
      })

      expect(success).toBe(true)
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'accepted',
          covered_by: mockUser.id,
        })
      )
    })

    it('declines coverage request', async () => {
      const { result } = renderHook(() => useActionableInstances())

      let success

      await act(async () => {
        success = await result.current.respondToCoverage('req-1', false)
      })

      expect(success).toBe(true)
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'declined',
          covered_by: null,
        })
      )
    })

    it('returns false when user is not authenticated', async () => {
      mockUserState = null

      const { result } = renderHook(() => useActionableInstances())

      let success

      await act(async () => {
        success = await result.current.respondToCoverage('req-1', true)
      })

      expect(success).toBe(false)
    })
  })
})
