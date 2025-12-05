import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useEventNotes } from './useEventNotes'
import { createMockUser, resetIdCounter } from '@/test/mocks/factories'

// Module-level state for mocking
const mockUser = createMockUser()
let mockUserState: ReturnType<typeof createMockUser> | null = mockUser
let mockError: { message: string } | null = null
let mockFetchResult: unknown = null
let mockUpsertResult: unknown = null
const mockSelect = vi.fn()
const mockDelete = vi.fn()
const mockUpsert = vi.fn()
const mockEq = vi.fn()
const mockIn = vi.fn()
const mockMaybeSingle = vi.fn()
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
      eq: (field2: string, value2: string) => {
        mockEq(field2, value2)
        return {
          maybeSingle: () => {
            mockMaybeSingle()
            return Promise.resolve({ data: mockFetchResult, error: mockError })
          },
        }
      },
      in: (field2: string, values: string[]) => {
        mockIn(field2, values)
        return Promise.resolve({ data: mockFetchResult, error: mockError })
      },
    }
  },
})

// Create chainable mock for upsert operations
const createUpsertChain = () => ({
  select: () => {
    mockSelect()
    return {
      single: () => {
        mockSingle()
        return Promise.resolve({ data: mockUpsertResult, error: mockError })
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
})

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => createSelectChain(),
      upsert: (data: unknown, options: unknown) => {
        mockUpsert(data, options)
        return createUpsertChain()
      },
      delete: () => {
        mockDelete()
        return createDeleteChain()
      },
    }),
  },
}))

describe('useEventNotes', () => {
  beforeEach(() => {
    resetIdCounter()
    mockError = null
    mockFetchResult = null
    mockUpsertResult = null
    mockUserState = mockUser
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('starts with empty notes map', () => {
      const { result } = renderHook(() => useEventNotes())
      expect(result.current.notes.size).toBe(0)
    })

    it('starts with loading=false', () => {
      const { result } = renderHook(() => useEventNotes())
      expect(result.current.loading).toBe(false)
    })

    it('starts with no error', () => {
      const { result } = renderHook(() => useEventNotes())
      expect(result.current.error).toBeNull()
    })
  })

  describe('fetchNote', () => {
    it('fetches note for a specific event', async () => {
      mockFetchResult = {
        id: 'note-1',
        user_id: mockUser.id,
        google_event_id: 'event-123',
        notes: 'Test notes',
        assigned_to: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }

      const { result } = renderHook(() => useEventNotes())

      let fetchedNote

      await act(async () => {
        fetchedNote = await result.current.fetchNote('event-123')
      })

      expect(fetchedNote).not.toBeNull()
      expect(fetchedNote?.googleEventId).toBe('event-123')
      expect(fetchedNote?.notes).toBe('Test notes')
    })

    it('returns null when user is not authenticated', async () => {
      mockUserState = null

      const { result } = renderHook(() => useEventNotes())

      let fetchedNote

      await act(async () => {
        fetchedNote = await result.current.fetchNote('event-123')
      })

      expect(fetchedNote).toBeNull()
    })

    it('returns cached note if already fetched', async () => {
      mockFetchResult = {
        id: 'note-1',
        user_id: mockUser.id,
        google_event_id: 'event-123',
        notes: 'Test notes',
        assigned_to: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }

      const { result } = renderHook(() => useEventNotes())

      // First fetch
      await act(async () => {
        await result.current.fetchNote('event-123')
      })

      expect(mockMaybeSingle).toHaveBeenCalledTimes(1)

      // Second fetch should use cache
      await act(async () => {
        await result.current.fetchNote('event-123')
      })

      // Should not call the DB again
      expect(mockMaybeSingle).toHaveBeenCalledTimes(1)
    })

    it('returns null when note does not exist', async () => {
      mockFetchResult = null

      const { result } = renderHook(() => useEventNotes())

      let fetchedNote

      await act(async () => {
        fetchedNote = await result.current.fetchNote('event-123')
      })

      expect(fetchedNote).toBeNull()
    })

    it('sets error on fetch failure', async () => {
      mockError = { message: 'Database error' }

      const { result } = renderHook(() => useEventNotes())

      await act(async () => {
        await result.current.fetchNote('event-123')
      })

      expect(result.current.error).toBe('Database error')
    })

    it('sets loading while fetching', async () => {
      mockFetchResult = {
        id: 'note-1',
        user_id: mockUser.id,
        google_event_id: 'event-123',
        notes: 'Test notes',
        assigned_to: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }

      const { result } = renderHook(() => useEventNotes())

      // Start fetch but check loading state during the operation
      act(() => {
        result.current.fetchNote('event-123')
      })

      // Loading should be set
      expect(result.current.loading).toBe(true)

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })
    })
  })

  describe('updateNote', () => {
    it('creates new note for event', async () => {
      mockUpsertResult = {
        id: 'new-note-id',
        user_id: mockUser.id,
        google_event_id: 'event-123',
        notes: 'New note text',
        assigned_to: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }

      const { result } = renderHook(() => useEventNotes())

      await act(async () => {
        await result.current.updateNote('event-123', 'New note text')
      })

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: mockUser.id,
          google_event_id: 'event-123',
          notes: 'New note text',
        }),
        expect.objectContaining({ onConflict: 'user_id,google_event_id' })
      )
    })

    it('updates existing note', async () => {
      // First, populate the cache with an existing note
      mockFetchResult = {
        id: 'note-1',
        user_id: mockUser.id,
        google_event_id: 'event-123',
        notes: 'Original notes',
        assigned_to: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }

      const { result } = renderHook(() => useEventNotes())

      await act(async () => {
        await result.current.fetchNote('event-123')
      })

      mockUpsertResult = {
        id: 'note-1',
        user_id: mockUser.id,
        google_event_id: 'event-123',
        notes: 'Updated notes',
        assigned_to: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
      }

      await act(async () => {
        await result.current.updateNote('event-123', 'Updated notes')
      })

      const note = result.current.getNote('event-123')
      expect(note?.notes).toBe('Updated notes')
    })

    it('applies optimistic update immediately', async () => {
      // Mock returns the same value that's passed in - simulating successful server response
      mockUpsertResult = {
        id: 'new-note-id',
        user_id: mockUser.id,
        google_event_id: 'event-123',
        notes: 'Optimistic note',
        assigned_to: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }

      const { result } = renderHook(() => useEventNotes())

      await act(async () => {
        await result.current.updateNote('event-123', 'Optimistic note')
      })

      // Should be available after update
      const note = result.current.getNote('event-123')
      expect(note?.notes).toBe('Optimistic note')
    })

    it('rolls back on server error', async () => {
      const { result } = renderHook(() => useEventNotes())

      mockError = { message: 'Upsert failed' }

      await act(async () => {
        await result.current.updateNote('event-123', 'New note')
      })

      // Note should not be in cache
      expect(result.current.getNote('event-123')).toBeUndefined()
      expect(result.current.error).toBe('Upsert failed')
    })

    it('does nothing when user is not authenticated', async () => {
      mockUserState = null

      const { result } = renderHook(() => useEventNotes())

      await act(async () => {
        await result.current.updateNote('event-123', 'New note')
      })

      expect(mockUpsert).not.toHaveBeenCalled()
    })
  })

  describe('deleteNote', () => {
    it('removes note from cache', async () => {
      // First, populate the cache
      mockFetchResult = {
        id: 'note-1',
        user_id: mockUser.id,
        google_event_id: 'event-123',
        notes: 'Test notes',
        assigned_to: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }

      const { result } = renderHook(() => useEventNotes())

      await act(async () => {
        await result.current.fetchNote('event-123')
      })

      expect(result.current.getNote('event-123')).not.toBeUndefined()

      await act(async () => {
        await result.current.deleteNote('event-123')
      })

      expect(result.current.getNote('event-123')).toBeUndefined()
    })

    it('calls supabase delete', async () => {
      mockFetchResult = {
        id: 'note-1',
        user_id: mockUser.id,
        google_event_id: 'event-123',
        notes: 'Test notes',
        assigned_to: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }

      const { result } = renderHook(() => useEventNotes())

      await act(async () => {
        await result.current.fetchNote('event-123')
      })

      await act(async () => {
        await result.current.deleteNote('event-123')
      })

      expect(mockDelete).toHaveBeenCalled()
    })

    it('rolls back on delete failure', async () => {
      mockFetchResult = {
        id: 'note-1',
        user_id: mockUser.id,
        google_event_id: 'event-123',
        notes: 'Test notes',
        assigned_to: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }

      const { result } = renderHook(() => useEventNotes())

      await act(async () => {
        await result.current.fetchNote('event-123')
      })

      mockError = { message: 'Delete failed' }

      await act(async () => {
        await result.current.deleteNote('event-123')
      })

      // Note should be restored
      expect(result.current.getNote('event-123')).not.toBeUndefined()
      expect(result.current.error).toBe('Delete failed')
    })

    it('does nothing for non-existent note', async () => {
      const { result } = renderHook(() => useEventNotes())

      await act(async () => {
        await result.current.deleteNote('non-existent')
      })

      expect(mockDelete).not.toHaveBeenCalled()
    })

    it('does nothing when user is not authenticated', async () => {
      mockUserState = null

      const { result } = renderHook(() => useEventNotes())

      await act(async () => {
        await result.current.deleteNote('event-123')
      })

      expect(mockDelete).not.toHaveBeenCalled()
    })
  })

  describe('fetchNotesForEvents', () => {
    it('fetches notes for multiple events', async () => {
      mockFetchResult = [
        {
          id: 'note-1',
          user_id: mockUser.id,
          google_event_id: 'event-1',
          notes: 'Note 1',
          assigned_to: null,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 'note-2',
          user_id: mockUser.id,
          google_event_id: 'event-2',
          notes: 'Note 2',
          assigned_to: null,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ]

      const { result } = renderHook(() => useEventNotes())

      await act(async () => {
        await result.current.fetchNotesForEvents(['event-1', 'event-2', 'event-3'])
      })

      expect(mockIn).toHaveBeenCalledWith('google_event_id', ['event-1', 'event-2', 'event-3'])
      expect(result.current.notes.size).toBe(2)
    })

    it('skips already cached events', async () => {
      // First fetch one note
      mockFetchResult = {
        id: 'note-1',
        user_id: mockUser.id,
        google_event_id: 'event-1',
        notes: 'Note 1',
        assigned_to: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }

      const { result } = renderHook(() => useEventNotes())

      await act(async () => {
        await result.current.fetchNote('event-1')
      })

      vi.clearAllMocks()

      mockFetchResult = [
        {
          id: 'note-2',
          user_id: mockUser.id,
          google_event_id: 'event-2',
          notes: 'Note 2',
          assigned_to: null,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ]

      await act(async () => {
        await result.current.fetchNotesForEvents(['event-1', 'event-2'])
      })

      // Should only fetch uncached event
      expect(mockIn).toHaveBeenCalledWith('google_event_id', ['event-2'])
    })

    it('does nothing for empty array', async () => {
      const { result } = renderHook(() => useEventNotes())

      await act(async () => {
        await result.current.fetchNotesForEvents([])
      })

      expect(mockIn).not.toHaveBeenCalled()
    })

    it('does nothing when user is not authenticated', async () => {
      mockUserState = null

      const { result } = renderHook(() => useEventNotes())

      await act(async () => {
        await result.current.fetchNotesForEvents(['event-1', 'event-2'])
      })

      expect(mockIn).not.toHaveBeenCalled()
    })
  })

  describe('updateEventAssignment', () => {
    it('creates new note with assignment', async () => {
      mockUpsertResult = {
        id: 'new-note-id',
        user_id: mockUser.id,
        google_event_id: 'event-123',
        notes: null,
        assigned_to: 'member-1',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }

      const { result } = renderHook(() => useEventNotes())

      await act(async () => {
        await result.current.updateEventAssignment('event-123', 'member-1')
      })

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: mockUser.id,
          google_event_id: 'event-123',
          assigned_to: 'member-1',
        }),
        expect.objectContaining({ onConflict: 'user_id,google_event_id' })
      )
    })

    it('updates existing note assignment', async () => {
      // First, populate the cache
      mockFetchResult = {
        id: 'note-1',
        user_id: mockUser.id,
        google_event_id: 'event-123',
        notes: 'Some notes',
        assigned_to: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }

      const { result } = renderHook(() => useEventNotes())

      await act(async () => {
        await result.current.fetchNote('event-123')
      })

      mockUpsertResult = {
        id: 'note-1',
        user_id: mockUser.id,
        google_event_id: 'event-123',
        notes: 'Some notes',
        assigned_to: 'member-1',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
      }

      await act(async () => {
        await result.current.updateEventAssignment('event-123', 'member-1')
      })

      const note = result.current.getNote('event-123')
      expect(note?.assignedTo).toBe('member-1')
    })

    it('applies optimistic update immediately', async () => {
      mockUpsertResult = {
        id: 'new-note-id',
        user_id: mockUser.id,
        google_event_id: 'event-123',
        notes: null,
        assigned_to: 'member-1',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }

      const { result } = renderHook(() => useEventNotes())

      await act(async () => {
        await result.current.updateEventAssignment('event-123', 'member-1')
      })

      const note = result.current.getNote('event-123')
      expect(note?.assignedTo).toBe('member-1')
    })

    it('rolls back on server error', async () => {
      const { result } = renderHook(() => useEventNotes())

      mockError = { message: 'Upsert failed' }

      await act(async () => {
        await result.current.updateEventAssignment('event-123', 'member-1')
      })

      expect(result.current.getNote('event-123')).toBeUndefined()
      expect(result.current.error).toBe('Upsert failed')
    })

    it('does nothing when user is not authenticated', async () => {
      mockUserState = null

      const { result } = renderHook(() => useEventNotes())

      await act(async () => {
        await result.current.updateEventAssignment('event-123', 'member-1')
      })

      expect(mockUpsert).not.toHaveBeenCalled()
    })
  })

  describe('getNote', () => {
    it('returns note from cache', async () => {
      mockFetchResult = {
        id: 'note-1',
        user_id: mockUser.id,
        google_event_id: 'event-123',
        notes: 'Test notes',
        assigned_to: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }

      const { result } = renderHook(() => useEventNotes())

      await act(async () => {
        await result.current.fetchNote('event-123')
      })

      const note = result.current.getNote('event-123')
      expect(note?.notes).toBe('Test notes')
    })

    it('returns undefined for non-existent note', () => {
      const { result } = renderHook(() => useEventNotes())
      expect(result.current.getNote('non-existent')).toBeUndefined()
    })
  })

  describe('data transformation', () => {
    it('converts snake_case DB fields to camelCase', async () => {
      mockFetchResult = {
        id: 'note-1',
        user_id: mockUser.id,
        google_event_id: 'event-123',
        notes: 'Test notes',
        assigned_to: 'member-1',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
      }

      const { result } = renderHook(() => useEventNotes())

      await act(async () => {
        await result.current.fetchNote('event-123')
      })

      const note = result.current.getNote('event-123')
      expect(note?.googleEventId).toBe('event-123')
      expect(note?.assignedTo).toBe('member-1')
      expect(note?.createdAt).toBeInstanceOf(Date)
      expect(note?.updatedAt).toBeInstanceOf(Date)
    })

    it('parses date strings to Date objects', async () => {
      mockFetchResult = {
        id: 'note-1',
        user_id: mockUser.id,
        google_event_id: 'event-123',
        notes: 'Test notes',
        assigned_to: null,
        created_at: '2024-06-15T10:30:00Z',
        updated_at: '2024-06-16T12:45:00Z',
      }

      const { result } = renderHook(() => useEventNotes())

      await act(async () => {
        await result.current.fetchNote('event-123')
      })

      const note = result.current.getNote('event-123')
      expect(note?.createdAt.toISOString()).toBe('2024-06-15T10:30:00.000Z')
      expect(note?.updatedAt.toISOString()).toBe('2024-06-16T12:45:00.000Z')
    })
  })
})
