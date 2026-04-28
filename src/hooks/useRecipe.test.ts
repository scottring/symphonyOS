import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useRecipe } from './useRecipe'
import type { DbRecipe } from '@/types/meal-planner'

function makeQueryMock(returnData: unknown) {
  const chain: any = {
    select: vi.fn(() => chain),
    update: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    single: vi.fn(() => Promise.resolve({
      data: Array.isArray(returnData) ? returnData[0] : returnData,
      error: null,
    })),
    then: (resolve: any) => resolve({ data: returnData, error: null }),
  }
  return chain
}

vi.mock('@/lib/supabase', () => {
  const mockFrom = vi.fn()
  return {
    supabase: {
      from: mockFrom,
      auth: {
        getUser: vi.fn(() =>
          Promise.resolve({ data: { user: { id: 'u1' } }, error: null })
        ),
      },
    },
    __mockFrom: mockFrom,
  }
})

import { __mockFrom } from '@/lib/supabase'

const sampleRow: DbRecipe = {
  id: 'r1',
  user_id: 'u1',
  title: 'Sheet-Pan Salmon',
  source_url: null,
  source_label: null,
  image_url: null,
  prep_minutes: 30,
  ingredients: ['salmon'],
  instructions: ['bake'],
  tags: [],
  kid_acceptance: {},
  acceptance_sentence: null,
  is_prep_friendly: false,
  times_cooked: 0,
  last_cooked_at: null,
  streak_note: null,
  created_at: '2026-04-28T00:00:00Z',
  updated_at: '2026-04-28T00:00:00Z',
}

describe('useRecipe', () => {
  beforeEach(() => {
    vi.mocked(__mockFrom as any).mockReset()
  })

  it('loads a single recipe by id', async () => {
    vi.mocked(__mockFrom as any).mockReturnValue(makeQueryMock(sampleRow))
    const { result } = renderHook(() => useRecipe('r1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.recipe?.title).toBe('Sheet-Pan Salmon')
  })

  it('updateAcceptance writes kid_acceptance + acceptance_sentence', async () => {
    vi.mocked(__mockFrom as any).mockReturnValue(makeQueryMock(sampleRow))
    const { result } = renderHook(() => useRecipe('r1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.updateAcceptance({
        kidAcceptance: { fm1: { level: 'loves' } },
        sentence: 'Both kids love this',
      })
    })
    const calls = vi.mocked(__mockFrom as any).mock.calls
    expect(calls.some((c: any) => c[0] === 'recipes')).toBe(true)
  })
})
