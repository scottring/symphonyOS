import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useRecipes } from './useRecipes'
import type { DbRecipe } from '@/types/meal-planner'

function makeQueryMock(returnData: unknown) {
  const chain: any = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    single: vi.fn(() => Promise.resolve({
      data: Array.isArray(returnData) ? returnData[0] : returnData,
      error: null,
    })),
    then: (resolve: any) => resolve({ data: returnData, error: null }),
  }
  return chain
}

const mockUserId = '00000000-0000-0000-0000-000000000001'

vi.mock('@/lib/supabase', () => {
  const mockFrom = vi.fn()
  return {
    supabase: {
      from: mockFrom,
      auth: {
        getUser: vi.fn(() =>
          Promise.resolve({ data: { user: { id: mockUserId } }, error: null })
        ),
      },
    },
    __mockFrom: mockFrom,
  }
})

vi.mock('@/lib/recipeParser', () => ({
  fetchRecipe: vi.fn(),
}))

import { __mockFrom } from '@/lib/supabase'
import { fetchRecipe } from '@/lib/recipeParser'

const sampleRow: DbRecipe = {
  id: 'r1',
  user_id: mockUserId,
  title: 'Sheet-Pan Salmon',
  source_url: 'https://cooking.nytimes.com/recipes/123',
  source_label: 'NYT Cooking',
  image_url: null,
  prep_minutes: 30,
  ingredients: ['1 salmon', '2 lemons'],
  instructions: ['bake'],
  tags: ['quick'],
  kid_acceptance: {},
  acceptance_sentence: null,
  is_prep_friendly: false,
  times_cooked: 0,
  last_cooked_at: null,
  streak_note: null,
  created_at: '2026-04-28T12:00:00Z',
  updated_at: '2026-04-28T12:00:00Z',
}

describe('useRecipes', () => {
  beforeEach(() => {
    vi.mocked(__mockFrom as any).mockReset()
    vi.mocked(fetchRecipe).mockReset()
  })

  it('fetches recipes on mount', async () => {
    vi.mocked(__mockFrom as any).mockReturnValue(makeQueryMock([sampleRow]))
    const { result } = renderHook(() => useRecipes())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.recipes).toHaveLength(1)
    expect(result.current.recipes[0].title).toBe('Sheet-Pan Salmon')
  })

  it('addByUrl scrapes the URL and inserts the row', async () => {
    vi.mocked(__mockFrom as any).mockReturnValue(makeQueryMock([sampleRow]))
    vi.mocked(fetchRecipe).mockResolvedValue({
      title: 'Sheet-Pan Salmon',
      source: 'https://cooking.nytimes.com/recipes/123',
      ingredients: ['1 salmon', '2 lemons'],
      instructions: ['bake'],
      totalTime: 'PT30M',
    })
    const { result } = renderHook(() => useRecipes())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.addByUrl('https://cooking.nytimes.com/recipes/123')
    })
    expect(fetchRecipe).toHaveBeenCalledWith('https://cooking.nytimes.com/recipes/123')
    const calls = vi.mocked(__mockFrom as any).mock.calls
    expect(calls.some((c: any) => c[0] === 'recipes')).toBe(true)
  })

  it('remove deletes by id and optimistically updates', async () => {
    vi.mocked(__mockFrom as any).mockReturnValue(makeQueryMock([sampleRow]))
    const { result } = renderHook(() => useRecipes())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.recipes).toHaveLength(1)
    await act(async () => {
      await result.current.remove('r1')
    })
    expect(result.current.recipes).toHaveLength(0)
  })
})
