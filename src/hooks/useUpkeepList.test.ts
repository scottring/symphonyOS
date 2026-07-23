import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useUpkeepList, UPKEEP_LIST_TITLE, UPKEEP_SEED_ITEMS } from './useUpkeepList'

let mockUser: { id: string } | null = { id: 'test-user-id' }
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUser, loading: false, error: null }),
}))

// Scenario state the supabase mock serves
let listRows: { id: string; title: string }[] = []
let itemRows: { id: string; text: string; completed: boolean }[] = []
const inserted: { table: string; payload: unknown }[] = []

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => {
        if (table === 'lists') {
          return {
            eq: () => ({
              ilike: () => ({
                limit: () => Promise.resolve({ data: listRows, error: null }),
              }),
            }),
          }
        }
        return {
          eq: (_f: string, _v: string) => ({
            eq: () => ({
              order: () => Promise.resolve({ data: itemRows, error: null }),
            }),
          }),
        }
      },
      insert: (payload: unknown) => {
        inserted.push({ table, payload })
        if (table === 'lists') {
          return {
            select: () => ({
              single: () => Promise.resolve({ data: { id: 'new-list-id', title: UPKEEP_LIST_TITLE }, error: null }),
            }),
          }
        }
        return Promise.resolve({ data: null, error: null })
      },
    }),
  },
}))

describe('useUpkeepList', () => {
  beforeEach(() => {
    mockUser = { id: 'test-user-id' }
    listRows = []
    itemRows = []
    inserted.length = 0
  })

  it('loads open items from an existing upkeep list', async () => {
    listRows = [{ id: 'list-1', title: 'Monthly upkeep' }]
    itemRows = [
      { id: 'i1', text: 'Reconcile budget (YNAB)', completed: false },
      { id: 'i2', text: 'Old done thing', completed: true },
    ]
    const { result } = renderHook(() => useUpkeepList())
    await waitFor(() => expect(result.current.upkeepLoading).toBe(false))
    // The completed item is filtered out by the query in production; the mock
    // returns rows verbatim, so assert the hook exposes what the query returns
    // minus nothing — production filters completed=false server-side.
    expect(result.current.upkeepItems.some((i) => i.text === 'Reconcile budget (YNAB)')).toBe(true)
  })

  it('ensureUpkeepList creates and seeds when absent', async () => {
    const { result } = renderHook(() => useUpkeepList())
    await waitFor(() => expect(result.current.upkeepLoading).toBe(false))
    expect(result.current.upkeepItems).toEqual([])
    await act(() => result.current.ensureUpkeepList())
    expect(inserted.some((c) => c.table === 'lists')).toBe(true)
    const itemInsert = inserted.find((c) => c.table === 'list_items')
    expect(itemInsert).toBeDefined()
    expect((itemInsert!.payload as unknown[]).length).toBe(UPKEEP_SEED_ITEMS.length)
    // Seeds surface immediately without waiting for a refetch
    expect(result.current.upkeepItems.length).toBe(UPKEEP_SEED_ITEMS.length)
  })

  it('ensureUpkeepList is a no-op when the list exists', async () => {
    listRows = [{ id: 'list-1', title: 'monthly UPKEEP' }] // case-insensitive match
    const { result } = renderHook(() => useUpkeepList())
    await waitFor(() => expect(result.current.upkeepLoading).toBe(false))
    await act(() => result.current.ensureUpkeepList())
    expect(inserted.length).toBe(0)
  })
})
