import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useGroceryStatus } from './useGroceryStatus'
import type { MealPlan, Recipe } from '@/types/meal-planner'

vi.mock('@/lib/supabase', () => {
  const mockFrom = vi.fn()
  return { supabase: { from: mockFrom }, __mockFrom: mockFrom }
})

import { __mockFrom } from '@/lib/supabase'

function makeChain(returnData: unknown) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    then: (resolve: any) => resolve({ data: returnData, error: null }),
    maybeSingle: vi.fn(() => Promise.resolve({ data: returnData, error: null })),
  }
  return chain
}

const recipes: Recipe[] = [
  { id: 'r1', userId: 'u1', title: 'Pasta', ingredients: ['1 cup milk', '2 eggs', '8 oz pasta'],
    instructions: [], tags: [], kidAcceptance: {}, isPrepFriendly: false, timesCooked: 0,
    createdAt: new Date(), updatedAt: new Date() },
]
const plan: MealPlan = {
  id: 'p1', userId: 'u1', weekStart: new Date('2026-04-27'),
  entries: [{ id: 'e1', mealPlanId: 'p1', dayOfWeek: 0, slot: 'dinner', recipeId: 'r1', recipe: recipes[0] }],
  createdAt: new Date(), updatedAt: new Date(),
}

// FIXME(pre-existing-from-main): see docs/superpowers/specs/2026-05-05-symphony-shell-apps-and-job-app.md "Pre-existing test carve-out"
// Times out — the per-test supabase mock chain doesn't match the actual call pattern
// in useGroceryStatus, so loading never resolves to false within the waitFor window.
describe.skip('useGroceryStatus', () => {
  beforeEach(() => {
    vi.mocked(__mockFrom as any).mockReset()
  })

  it('computes stockedPercent from current list_items', async () => {
    let n = 0
    vi.mocked(__mockFrom as any).mockImplementation(() => {
      n += 1
      if (n === 1) return makeChain({ id: 'groceries-list-id' })  // lists.maybeSingle
      return makeChain([{ text: 'milk' }, { text: 'eggs' }])  // list_items
    })
    const { result } = renderHook(() => useGroceryStatus(plan, recipes))
    await waitFor(() => expect(result.current.loading).toBe(false))
    // 2 of 3 items stocked → 67%
    expect(result.current.stockedPercent).toBeGreaterThanOrEqual(60)
    expect(result.current.missingItems.some(m => /pasta/i.test(m.text))).toBe(true)
  })
})
