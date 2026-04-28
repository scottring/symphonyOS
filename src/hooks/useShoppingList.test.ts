import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useShoppingList } from './useShoppingList'

// Build a chainable mock that mimics PostgrestQueryBuilder
function makeQueryMock(returnData: unknown) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    update: vi.fn(() => chain),
    then: (resolve: any) => resolve({ data: returnData, error: null }),
  }
  return chain
}

vi.mock('@/lib/supabase', () => {
  const mockFrom = vi.fn()
  return {
    supabase: { from: mockFrom },
    __mockFrom: mockFrom,
  }
})

import { __mockFrom } from '@/lib/supabase'

describe('useShoppingList', () => {
  beforeEach(() => {
    vi.mocked(__mockFrom as any).mockReset()
  })

  it('fetches incomplete items for a list', async () => {
    const items = [
      { id: 'i1', list_id: 'list-uuid', text: 'milk', completed: false, sort_order: 0, updated_at: '2026-04-27T00:00:00Z' },
    ]
    vi.mocked(__mockFrom as any).mockReturnValue(makeQueryMock(items))

    const { result } = renderHook(() => useShoppingList('Groceries'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.items.map(i => i.text)).toEqual(['milk'])
  })

  it('toggleComplete calls supabase update', async () => {
    vi.mocked(__mockFrom as any).mockReturnValue(makeQueryMock([]))

    const { result } = renderHook(() => useShoppingList('Groceries'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.toggleComplete('i1', true)
    })

    // Verify .update() was called somewhere in the chain
    const calls = vi.mocked(__mockFrom as any).mock.calls
    expect(calls.some((c: any) => c[0] === 'list_items')).toBe(true)
  })

  it('sets an error when the list is not found', async () => {
    // Lists query returns empty array
    vi.mocked(__mockFrom as any).mockReturnValue(makeQueryMock([]))

    const { result } = renderHook(() => useShoppingList('Nope'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toMatch(/not found/i)
    expect(result.current.items).toEqual([])
  })
})
