import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useNeededListItems } from './useNeededListItems'
import { createMockUser, resetIdCounter } from '@/test/mocks/factories'

const mockUser = createMockUser()
let mockError: { message: string } | null = null
let mockFetchResult: unknown = null

const mockEq = vi.fn()

// Chainable mock for the read: .select('*').eq('user_id', id).eq('needed_on', day).eq('completed', false)
const createSelectChain = () => {
  const chain = {
    eq: (field: string, value: string) => {
      mockEq(field, value)
      return chain
    },
    then: (resolve: (v: { data: unknown; error: unknown }) => void) =>
      resolve({ data: mockFetchResult, error: mockError }),
  }
  return chain
}

vi.mock('@/lib/supabase', () => {
  const __mod: any = {
    supabase: {
      auth: {
        getUser: vi.fn(),
      },
      from: vi.fn(() => ({
        select: () => createSelectChain(),
      })),
    },
  }
  return {
    ...__mod,
    getAuthUser: (...a: any[]) =>
      __mod.supabase.auth?.getUser?.(...a) ??
      Promise.resolve({ data: { user: null }, error: null }),
  }
})

import { supabase } from '@/lib/supabase'

const makeDbItem = (overrides: Record<string, unknown> = {}) => ({
  id: 'i1',
  list_id: 'shop',
  user_id: mockUser.id,
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
    mockFetchResult = null
    vi.clearAllMocks()
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: mockUser as never },
      error: null,
    })
    vi.mocked(supabase.from).mockReturnValue({
      select: () => createSelectChain(),
    } as never)
  })

  it('queries list_items for the given day and maps them', async () => {
    mockFetchResult = [makeDbItem()]

    const { result } = renderHook(() => useNeededListItems(new Date(2026, 7, 19)))

    await waitFor(() => expect(result.current.items).toHaveLength(1))
    expect(result.current.items[0].text).toBe('Pull-ups')
    expect(result.current.items[0].listId).toBe('shop')
    expect(mockEq).toHaveBeenCalledWith('user_id', mockUser.id)
    expect(mockEq).toHaveBeenCalledWith('needed_on', '2026-08-19')
    expect(mockEq).toHaveBeenCalledWith('completed', false)
  })

  it('returns nothing when no items are marked', async () => {
    mockFetchResult = []

    const { result } = renderHook(() => useNeededListItems(new Date(2026, 7, 19)))

    await waitFor(() => expect(result.current.items).toEqual([]))
  })
})
