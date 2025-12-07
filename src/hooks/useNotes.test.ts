import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useNotes } from './useNotes'
import type { DbNote } from '@/types/note'

// Module-level state for mocking
const mockUser = { id: 'user-1', email: 'test@example.com' }
let mockUserState: typeof mockUser | null = mockUser
let mockSupabaseData: DbNote[] = []
let mockError: { message: string } | null = null
const mockUpdate = vi.fn()
const mockDelete = vi.fn()
const mockInsert = vi.fn()

// Mock useAuth
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUserState }),
}))

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'notes') {
        return {
          select: () => ({
            eq: () => ({
              order: () => Promise.resolve({ data: mockSupabaseData, error: mockError }),
            }),
            in: () => ({
              order: () => Promise.resolve({ data: mockSupabaseData, error: mockError }),
            }),
          }),
          insert: (data: Partial<DbNote>) => {
            mockInsert(data)
            if (mockError) {
              return {
                select: () => ({
                  single: () => Promise.resolve({ data: null, error: mockError }),
                }),
              }
            }
            const newNote: DbNote = {
              id: 'new-note-id',
              user_id: mockUser.id,
              title: data.title ?? null,
              content: data.content || '',
              type: data.type || 'quick_capture',
              source: data.source || 'manual',
              topic_id: data.topic_id ?? null,
              audio_url: null,
              external_id: null,
              external_url: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }
            return {
              select: () => ({
                single: () => Promise.resolve({ data: newNote, error: null }),
              }),
            }
          },
          update: (data: Partial<DbNote>) => {
            mockUpdate(data)
            return {
              eq: () => Promise.resolve({ error: mockError }),
            }
          },
          delete: () => {
            mockDelete()
            return {
              eq: () => Promise.resolve({ error: mockError }),
            }
          },
        }
      }
      if (table === 'note_entity_links') {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: [], error: null }),
          }),
          insert: () => ({
            select: () => ({
              single: () => Promise.resolve({ data: { id: 'link-1' }, error: null }),
            }),
          }),
          delete: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
        }
      }
      return {}
    },
  },
}))

describe('useNotes', () => {
  beforeEach(() => {
    mockUserState = mockUser
    mockSupabaseData = []
    mockError = null
    mockUpdate.mockClear()
    mockDelete.mockClear()
    mockInsert.mockClear()
  })

  it('returns empty array when no user is logged in', async () => {
    mockUserState = null

    const { result } = renderHook(() => useNotes())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.notes).toEqual([])
  })

  it('fetches notes on mount', async () => {
    const mockNotes: DbNote[] = [
      {
        id: 'note-1',
        user_id: mockUser.id,
        title: 'First Note',
        content: 'This is the first note content',
        type: 'quick_capture',
        source: 'manual',
        topic_id: null,
        audio_url: null,
        external_id: null,
        external_url: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'note-2',
        user_id: mockUser.id,
        title: null,
        content: 'Second note without title',
        type: 'meeting_note',
        source: 'manual',
        topic_id: null,
        audio_url: null,
        external_id: null,
        external_url: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]
    mockSupabaseData = mockNotes

    const { result } = renderHook(() => useNotes())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.notes).toHaveLength(2)
    expect(result.current.notes[0].title).toBe('First Note')
    expect(result.current.notes[1].type).toBe('meeting_note')
  })

  it('adds a note with optimistic update', async () => {
    const { result } = renderHook(() => useNotes())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    await act(async () => {
      await result.current.addNote({
        content: 'New quick note',
        type: 'quick_capture',
      })
    })

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'New quick note',
        type: 'quick_capture',
      })
    )
    expect(result.current.notes).toHaveLength(1)
    expect(result.current.notes[0].content).toBe('New quick note')
  })

  it('updates a note with optimistic update', async () => {
    const mockNote: DbNote = {
      id: 'note-1',
      user_id: mockUser.id,
      title: 'Original Title',
      content: 'Original content',
      type: 'quick_capture',
      source: 'manual',
      topic_id: null,
      audio_url: null,
      external_id: null,
      external_url: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    mockSupabaseData = [mockNote]

    const { result } = renderHook(() => useNotes())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.notes).toHaveLength(1)
    })

    await act(async () => {
      await result.current.updateNote('note-1', { content: 'Updated content' })
    })

    expect(mockUpdate).toHaveBeenCalledWith({ content: 'Updated content' })
    expect(result.current.notes[0].content).toBe('Updated content')
  })

  it('deletes a note with optimistic update', async () => {
    const mockNote: DbNote = {
      id: 'note-1',
      user_id: mockUser.id,
      title: 'Note to Delete',
      content: 'This will be deleted',
      type: 'quick_capture',
      source: 'manual',
      topic_id: null,
      audio_url: null,
      external_id: null,
      external_url: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    mockSupabaseData = [mockNote]

    const { result } = renderHook(() => useNotes())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.notes).toHaveLength(1)
    })

    await act(async () => {
      await result.current.deleteNote('note-1')
    })

    expect(mockDelete).toHaveBeenCalled()
    expect(result.current.notes).toHaveLength(0)
  })

  it('searches notes by content and title', async () => {
    const mockNotes: DbNote[] = [
      {
        id: 'note-1',
        user_id: mockUser.id,
        title: 'Meeting with client',
        content: 'Discussed project requirements',
        type: 'meeting_note',
        source: 'manual',
        topic_id: null,
        audio_url: null,
        external_id: null,
        external_url: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'note-2',
        user_id: mockUser.id,
        title: null,
        content: 'Shopping list for the week',
        type: 'quick_capture',
        source: 'manual',
        topic_id: null,
        audio_url: null,
        external_id: null,
        external_url: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]
    mockSupabaseData = mockNotes

    const { result } = renderHook(() => useNotes())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    const meetingResults = result.current.searchNotes('meeting')
    expect(meetingResults).toHaveLength(1)
    expect(meetingResults[0].title).toBe('Meeting with client')

    const shoppingResults = result.current.searchNotes('shopping')
    expect(shoppingResults).toHaveLength(1)
    expect(shoppingResults[0].content).toContain('Shopping list')
  })

  it('groups notes by date', async () => {
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const lastWeek = new Date(today)
    lastWeek.setDate(lastWeek.getDate() - 5)

    const mockNotes: DbNote[] = [
      {
        id: 'note-1',
        user_id: mockUser.id,
        title: 'Today note',
        content: 'Created today',
        type: 'quick_capture',
        source: 'manual',
        topic_id: null,
        audio_url: null,
        external_id: null,
        external_url: null,
        created_at: today.toISOString(),
        updated_at: today.toISOString(),
      },
      {
        id: 'note-2',
        user_id: mockUser.id,
        title: 'Yesterday note',
        content: 'Created yesterday',
        type: 'quick_capture',
        source: 'manual',
        topic_id: null,
        audio_url: null,
        external_id: null,
        external_url: null,
        created_at: yesterday.toISOString(),
        updated_at: yesterday.toISOString(),
      },
      {
        id: 'note-3',
        user_id: mockUser.id,
        title: 'Last week note',
        content: 'Created last week',
        type: 'quick_capture',
        source: 'manual',
        topic_id: null,
        audio_url: null,
        external_id: null,
        external_url: null,
        created_at: lastWeek.toISOString(),
        updated_at: lastWeek.toISOString(),
      },
    ]
    mockSupabaseData = mockNotes

    const { result } = renderHook(() => useNotes())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.notesByDate.length).toBeGreaterThanOrEqual(2)

    const todayGroup = result.current.notesByDate.find(g => g.label === 'Today')
    expect(todayGroup).toBeDefined()
    expect(todayGroup?.notes).toHaveLength(1)

    const yesterdayGroup = result.current.notesByDate.find(g => g.label === 'Yesterday')
    expect(yesterdayGroup).toBeDefined()
    expect(yesterdayGroup?.notes).toHaveLength(1)
  })

  it('creates a notesMap for efficient lookup', async () => {
    const mockNotes: DbNote[] = [
      {
        id: 'note-1',
        user_id: mockUser.id,
        title: 'First',
        content: 'Content 1',
        type: 'quick_capture',
        source: 'manual',
        topic_id: null,
        audio_url: null,
        external_id: null,
        external_url: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'note-2',
        user_id: mockUser.id,
        title: 'Second',
        content: 'Content 2',
        type: 'quick_capture',
        source: 'manual',
        topic_id: null,
        audio_url: null,
        external_id: null,
        external_url: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]
    mockSupabaseData = mockNotes

    const { result } = renderHook(() => useNotes())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.notesMap.size).toBe(2)
    expect(result.current.notesMap.get('note-1')?.title).toBe('First')
    expect(result.current.notesMap.get('note-2')?.title).toBe('Second')
  })

  it('gets note by ID', async () => {
    const mockNotes: DbNote[] = [
      {
        id: 'note-1',
        user_id: mockUser.id,
        title: 'Test Note',
        content: 'Test content',
        type: 'quick_capture',
        source: 'manual',
        topic_id: null,
        audio_url: null,
        external_id: null,
        external_url: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]
    mockSupabaseData = mockNotes

    const { result } = renderHook(() => useNotes())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    const note = result.current.getNoteById('note-1')
    expect(note).toBeDefined()
    expect(note?.title).toBe('Test Note')

    const nonExistent = result.current.getNoteById('non-existent')
    expect(nonExistent).toBeUndefined()
  })

  it('filters notes by topic', async () => {
    const mockNotes: DbNote[] = [
      {
        id: 'note-1',
        user_id: mockUser.id,
        title: 'Work Note',
        content: 'Work related',
        type: 'quick_capture',
        source: 'manual',
        topic_id: 'topic-work',
        audio_url: null,
        external_id: null,
        external_url: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'note-2',
        user_id: mockUser.id,
        title: 'Personal Note',
        content: 'Personal stuff',
        type: 'quick_capture',
        source: 'manual',
        topic_id: 'topic-personal',
        audio_url: null,
        external_id: null,
        external_url: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'note-3',
        user_id: mockUser.id,
        title: 'Untagged',
        content: 'No topic',
        type: 'quick_capture',
        source: 'manual',
        topic_id: null,
        audio_url: null,
        external_id: null,
        external_url: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]
    mockSupabaseData = mockNotes

    const { result } = renderHook(() => useNotes())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    const workNotes = result.current.getNotesByTopic('topic-work')
    expect(workNotes).toHaveLength(1)
    expect(workNotes[0].title).toBe('Work Note')

    const untaggedNotes = result.current.getNotesByTopic(null)
    expect(untaggedNotes).toHaveLength(1)
    expect(untaggedNotes[0].title).toBe('Untagged')
  })

  it('filters notes by type', async () => {
    const mockNotes: DbNote[] = [
      {
        id: 'note-1',
        user_id: mockUser.id,
        title: 'Quick',
        content: 'Quick capture',
        type: 'quick_capture',
        source: 'manual',
        topic_id: null,
        audio_url: null,
        external_id: null,
        external_url: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'note-2',
        user_id: mockUser.id,
        title: 'Meeting',
        content: 'Meeting notes',
        type: 'meeting_note',
        source: 'manual',
        topic_id: null,
        audio_url: null,
        external_id: null,
        external_url: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]
    mockSupabaseData = mockNotes

    const { result } = renderHook(() => useNotes())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    const quickNotes = result.current.getNotesByType('quick_capture')
    expect(quickNotes).toHaveLength(1)
    expect(quickNotes[0].title).toBe('Quick')

    const meetingNotes = result.current.getNotesByType('meeting_note')
    expect(meetingNotes).toHaveLength(1)
    expect(meetingNotes[0].title).toBe('Meeting')
  })
})
