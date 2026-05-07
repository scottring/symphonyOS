import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useEventDiscussionFlags } from './useEventDiscussionFlags'
import { createMockUser, resetIdCounter } from '@/test/mocks/factories'

// Module-level state for mocking
const mockUser = createMockUser()
let mockError: { message: string } | null = null
let mockFetchResult: unknown = null
let mockUpsertResult: unknown = null
let mockUpdateResult: unknown = null

const mockUpsert = vi.fn()
const mockUpdate = vi.fn()
const mockDelete = vi.fn()
const mockEq = vi.fn()

// Create chainable mock for select (initial fetch): .select('*').eq('user_id', id)
const createSelectChain = () => ({
  eq: (field: string, value: string) => {
    mockEq(field, value)
    return Promise.resolve({ data: mockFetchResult, error: mockError })
  },
})

// Create chainable mock for upsert: .upsert(...).select().single()
const createUpsertChain = () => ({
  select: () => ({
    single: () => Promise.resolve({ data: mockUpsertResult, error: mockError }),
  }),
})

// Create chainable mock for delete: .delete().eq(...).eq(...)
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

// Create chainable mock for update: .update(...).eq(...).eq(...).select().single()
const createUpdateChain = () => ({
  eq: (field: string, value: string) => {
    mockEq(field, value)
    return {
      eq: (field2: string, value2: string) => {
        mockEq(field2, value2)
        return {
          select: () => ({
            single: () => Promise.resolve({ data: mockUpdateResult, error: mockError }),
          }),
        }
      },
    }
  },
})

// Mock Supabase — factory must not reference outer let/const declared after this call
// so we use inline vi.fn() and then configure them via the imported mock in beforeEach
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(() => ({
      select: () => createSelectChain(),
      upsert: (data: unknown, options: unknown) => {
        mockUpsert(data, options)
        return createUpsertChain()
      },
      delete: () => {
        mockDelete()
        return createDeleteChain()
      },
      update: (data: unknown) => {
        mockUpdate(data)
        return createUpdateChain()
      },
    })),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    })),
    removeChannel: vi.fn(),
  },
}))

// Import mocked supabase AFTER vi.mock so we can configure it per-test
import { supabase } from '@/lib/supabase'

const makeDbFlag = (overrides: Record<string, unknown> = {}) => ({
  id: 'flag-1',
  user_id: mockUser.id,
  google_event_base_id: 'abc',
  event_title: 'Soccer',
  calendar_id: 'fam',
  discussion_note: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
})

describe('useEventDiscussionFlags', () => {
  beforeEach(() => {
    resetIdCounter()
    mockError = null
    mockFetchResult = null
    mockUpsertResult = null
    mockUpdateResult = null
    vi.clearAllMocks()
    // Configure getUser to return mockUser after clearAllMocks
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: mockUser as never },
      error: null,
    })
    // Re-bind channel mock after clearAllMocks
    vi.mocked(supabase.channel).mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    } as never)
    vi.mocked(supabase.from).mockReturnValue({
      select: () => createSelectChain(),
      upsert: (data: unknown, options: unknown) => {
        mockUpsert(data, options)
        return createUpsertChain()
      },
      delete: () => {
        mockDelete()
        return createDeleteChain()
      },
      update: (data: unknown) => {
        mockUpdate(data)
        return createUpdateChain()
      },
    } as never)
  })

  it('starts with empty flags and loading=true', () => {
    const { result } = renderHook(() => useEventDiscussionFlags())
    expect(result.current.flags).toEqual([])
    expect(result.current.loading).toBe(true)
  })

  it('isFlagged returns true for flagged base ids (recurring instance maps to base)', async () => {
    mockFetchResult = [makeDbFlag()]

    const { result } = renderHook(() => useEventDiscussionFlags())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.isFlagged('abc')).toBe(true)
    expect(result.current.isFlagged('abc_20260318T130000Z')).toBe(true)
    expect(result.current.isFlagged('xyz')).toBe(false)
  })

  it('flagEvent inserts/upserts a row keyed by base id', async () => {
    mockFetchResult = []
    mockUpsertResult = makeDbFlag()

    const { result } = renderHook(() => useEventDiscussionFlags())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.flagEvent('abc_20260318T130000Z', {
        title: 'Soccer',
        calendarId: 'fam',
      })
    })

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        google_event_base_id: 'abc',
        event_title: 'Soccer',
        calendar_id: 'fam',
      }),
      expect.objectContaining({ onConflict: 'user_id,google_event_base_id' })
    )
  })

  it('unflagEvent deletes by base id', async () => {
    mockFetchResult = [makeDbFlag()]

    const { result } = renderHook(() => useEventDiscussionFlags())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.unflagEvent('abc_20260318T130000Z')
    })

    expect(mockDelete).toHaveBeenCalled()
    expect(mockEq).toHaveBeenCalledWith('google_event_base_id', 'abc')
  })

  it('updateNote updates the flag row', async () => {
    mockFetchResult = [makeDbFlag()]
    mockUpdateResult = makeDbFlag({ discussion_note: 'new note' })

    const { result } = renderHook(() => useEventDiscussionFlags())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.updateNote('abc', 'new note')
    })

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ discussion_note: 'new note' })
    )
  })
})
