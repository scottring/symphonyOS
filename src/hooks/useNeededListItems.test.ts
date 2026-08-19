import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useNeededListItems } from './useNeededListItems'
import { TO_BUY_CHANGED_EVENT } from '@/lib/lists/toBuy'
import { resetIdCounter } from '@/test/mocks/factories'

let mockError: { message: string } | null = null
let mockFetchResult: unknown = null

const mockIn = vi.fn()
const mockEq = vi.fn()
const mockUpdate = vi.fn()
const mockUpdateEq = vi.fn()
let mockUpdateError: { message: string } | null = null

// Chainable mock for the read: .select('*').in('list_id', ids).eq('needed_on', day).eq('completed', false)
const createSelectChain = () => {
  const chain = {
    in: (field: string, value: string[]) => {
      mockIn(field, value)
      return chain
    },
    eq: (field: string, value: unknown) => {
      mockEq(field, value)
      return chain
    },
    then: (resolve: (v: { data: unknown; error: unknown }) => void) =>
      resolve({ data: mockFetchResult, error: mockError }),
  }
  return chain
}

vi.mock('@/lib/supabase', () => {
  return {
    supabase: {
      auth: {
        getUser: vi.fn(),
      },
      from: vi.fn(),
    },
    getAuthUser: () => Promise.resolve({ data: { user: null }, error: null }),
  }
})

import { supabase } from '@/lib/supabase'

const LIST_IDS = ['shop']

const makeDbItem = (overrides: Record<string, unknown> = {}) => ({
  id: 'i1',
  list_id: 'shop',
  user_id: 'someone-else',
  text: 'Pull-ups',
  note: null,
  sort_order: 0,
  external_id: null,
  external_source: null,
  completed: false,
  completed_at: null,
  parent_item_id: null,
  needed_on: '2026-08-19',
  created_at: '2026-08-19T00:00:00Z',
  updated_at: '2026-08-19T00:00:00Z',
  ...overrides,
})

describe('useNeededListItems', () => {
  beforeEach(() => {
    resetIdCounter()
    mockError = null
    mockUpdateError = null
    mockFetchResult = null
    vi.clearAllMocks()
    vi.mocked(supabase.from).mockReturnValue({
      select: () => createSelectChain(),
      update: (patch: Record<string, unknown>) => {
        mockUpdate(patch)
        return {
          eq: (field: string, value: string) => {
            mockUpdateEq(field, value)
            return Promise.resolve({ error: mockUpdateError })
          },
        }
      },
    } as never)
  })

  it('queries list_items for the given day and maps them', async () => {
    mockFetchResult = [makeDbItem()]

    const { result } = renderHook(() => useNeededListItems(new Date(2026, 7, 19), LIST_IDS))

    await waitFor(() => expect(result.current.items).toHaveLength(1))
    expect(result.current.items[0].text).toBe('Pull-ups')
    expect(result.current.items[0].listId).toBe('shop')
    expect(mockIn).toHaveBeenCalledWith('list_id', ['shop'])
    expect(mockEq).toHaveBeenCalledWith('needed_on', '2026-08-19')
    expect(mockEq).toHaveBeenCalledWith('completed', false)
  })

  // Finding 2: the "To buy" list is created visibility:'family', so /lists
  // renders (and offers "Need today" on) another member's items. Filtering the
  // note to `user_id = me` made their marks land on nobody's note. Scope is by
  // list, exactly as /lists reads it — RLS governs which rows come back.
  it('does NOT filter by user_id — a household member\'s marked item still surfaces', async () => {
    mockFetchResult = [makeDbItem({ user_id: 'iris', text: 'Nappies' })]

    const { result } = renderHook(() => useNeededListItems(new Date(2026, 7, 19), LIST_IDS))

    await waitFor(() => expect(result.current.items).toHaveLength(1))
    expect(result.current.items[0].text).toBe('Nappies')
    expect(mockEq).not.toHaveBeenCalledWith('user_id', expect.anything())
  })

  it('returns nothing when no items are marked', async () => {
    mockFetchResult = []

    const { result } = renderHook(() => useNeededListItems(new Date(2026, 7, 19), LIST_IDS))

    await waitFor(() => expect(result.current.items).toEqual([]))
  })

  it('does not query at all before any list is visible', async () => {
    mockFetchResult = [makeDbItem()]

    const { result } = renderHook(() => useNeededListItems(new Date(2026, 7, 19), []))

    await waitFor(() => expect(result.current.items).toEqual([]))
    expect(supabase.from).not.toHaveBeenCalled()
  })

  // Finding 1: this is the write the note's checkbox depends on. It must reach
  // the database — routing it through ListsContext.updateItem did not, because
  // that function early-returns on any row outside the open list.
  describe('complete', () => {
    it('writes the completion straight to the row and announces the change', async () => {
      mockFetchResult = [makeDbItem()]
      const announced = vi.fn()
      window.addEventListener(TO_BUY_CHANGED_EVENT, announced)

      const { result } = renderHook(() => useNeededListItems(new Date(2026, 7, 19), LIST_IDS))
      await waitFor(() => expect(result.current.items).toHaveLength(1))

      // The DB no longer returns the row once it's completed.
      mockFetchResult = []
      await act(async () => { await result.current.complete('i1') })

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ completed: true, completed_at: expect.any(String) }),
      )
      expect(mockUpdateEq).toHaveBeenCalledWith('id', 'i1')
      expect(announced).toHaveBeenCalled()
      expect(result.current.items).toEqual([])

      window.removeEventListener(TO_BUY_CHANGED_EVENT, announced)
    })

    it('resyncs from the DB when the write fails, so the row comes back', async () => {
      mockFetchResult = [makeDbItem()]

      const { result } = renderHook(() => useNeededListItems(new Date(2026, 7, 19), LIST_IDS))
      await waitFor(() => expect(result.current.items).toHaveLength(1))

      mockUpdateError = { message: 'denied' }
      await act(async () => { await result.current.complete('i1') })

      await waitFor(() => expect(result.current.items).toHaveLength(1))
    })
  })
})
