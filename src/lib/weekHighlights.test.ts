import { describe, it, expect } from 'vitest'
import type { MealPlan, Recipe } from '@/types/meal-planner'
import type { FamilyMember } from '@/types/family'
import type { ConsolidatedIngredient } from '@/lib/consolidateIngredients'
import { familyDinnerSummary, groceriesSummary, prepAheadSummary } from './weekHighlights'

function mkMember(id: string, name: string, overrides: Partial<FamilyMember> = {}): FamilyMember {
  return {
    id, user_id: 'u1', name,
    initials: name.slice(0, 2).toUpperCase(),
    color: 'blue', avatar_url: null,
    is_full_user: false, display_order: 0,
    created_at: '2026-01-01',
    member_type: 'core',
    ...overrides,
  }
}

function mkRecipe(id: string, prep: number | null = 30): Recipe {
  return {
    id, title: `r-${id}`, sourceUrl: undefined, imageUrl: undefined,
    prepMinutes: prep ?? undefined, ingredients: [], instructions: [],
    createdAt: new Date(2026, 0, 1),
    userId: 'u1',
    tags: [],
    kidAcceptance: {},
    isPrepFriendly: false,
    timesCooked: 0,
    updatedAt: new Date(2026, 0, 1),
  } as Recipe
}

describe('familyDinnerSummary', () => {
  it('returns zero when plan is null', () => {
    expect(familyDinnerSummary(null, [], new Date()).nights).toBe(0)
  })

  it('counts unique day-of-week dinner entries', () => {
    const plan = {
      id: 'p1', userId: 'u1', weekStart: new Date(2026, 4, 17),
      parameter: undefined,
      createdAt: new Date(2026, 4, 17), updatedAt: new Date(2026, 4, 17),
      entries: [
        { id: 'e1', mealPlanId: 'p1', dayOfWeek: 0, slot: 'dinner', recipeId: 'r1', adHocTitle: undefined, familyMemberId: undefined, trackingState: 'as_planned' as const },
        { id: 'e2', mealPlanId: 'p1', dayOfWeek: 1, slot: 'dinner', recipeId: 'r2', adHocTitle: undefined, familyMemberId: undefined, trackingState: 'as_planned' as const },
        { id: 'e3', mealPlanId: 'p1', dayOfWeek: 2, slot: 'lunch',  recipeId: undefined, adHocTitle: 'X', familyMemberId: undefined, trackingState: 'as_planned' as const },
      ],
    } as MealPlan
    expect(familyDinnerSummary(plan, [], new Date()).nights).toBe(2)
  })

  it('emits core-member avatars (guests excluded)', () => {
    const members = [
      mkMember('a', 'Iris'),
      mkMember('b', 'Babysitter', { member_type: 'guest' }),
    ]
    const result = familyDinnerSummary(null, members, new Date())
    expect(result.avatars).toHaveLength(1)
    expect(result.avatars[0].id).toBe('a')
  })
})

describe('groceriesSummary', () => {
  it('returns missing count from passed list', () => {
    const items: ConsolidatedIngredient[] = [
      { text: 'Snap peas', category: 'Produce', fromRecipeIds: [] },
      { text: 'Brown rice', category: 'Pantry', fromRecipeIds: [] },
    ]
    expect(groceriesSummary(items).missingCount).toBe(2)
  })

  it('returns 0 when nothing missing', () => {
    expect(groceriesSummary([]).missingCount).toBe(0)
  })
})

describe('prepAheadSummary', () => {
  it('returns null when no plan', () => {
    expect(prepAheadSummary(null, [], new Date(2026, 4, 18))).toBeNull()
  })

  it("returns null when tomorrow's dinner has no recipeId", () => {
    const plan = {
      id: 'p1', userId: 'u1', weekStart: new Date(2026, 4, 17),
      parameter: undefined,
      createdAt: new Date(2026, 4, 17), updatedAt: new Date(2026, 4, 17),
      entries: [
        { id: 'e1', mealPlanId: 'p1', dayOfWeek: 2, slot: 'dinner', recipeId: undefined, adHocTitle: 'X', familyMemberId: undefined, trackingState: 'as_planned' as const },
      ],
    } as MealPlan
    expect(prepAheadSummary(plan, [], new Date(2026, 4, 18))).toBeNull()
  })

  it("returns null when tomorrow's dinner prep is ≤30 min", () => {
    const plan = {
      id: 'p1', userId: 'u1', weekStart: new Date(2026, 4, 17),
      parameter: undefined,
      createdAt: new Date(2026, 4, 17), updatedAt: new Date(2026, 4, 17),
      entries: [
        { id: 'e1', mealPlanId: 'p1', dayOfWeek: 2, slot: 'dinner', recipeId: 'r1', adHocTitle: undefined, familyMemberId: undefined, trackingState: 'as_planned' as const },
      ],
    } as MealPlan
    expect(prepAheadSummary(plan, [mkRecipe('r1', 30)], new Date(2026, 4, 18))).toBeNull()
  })

  it("returns recipe name when tomorrow's dinner prep is >30 min", () => {
    const plan = {
      id: 'p1', userId: 'u1', weekStart: new Date(2026, 4, 17),
      parameter: undefined,
      createdAt: new Date(2026, 4, 17), updatedAt: new Date(2026, 4, 17),
      entries: [
        { id: 'e1', mealPlanId: 'p1', dayOfWeek: 2, slot: 'dinner', recipeId: 'r1', adHocTitle: undefined, familyMemberId: undefined, trackingState: 'as_planned' as const },
      ],
    } as MealPlan
    const result = prepAheadSummary(plan, [mkRecipe('r1', 60)], new Date(2026, 4, 18))
    expect(result?.recipeName).toBe('r-r1')
  })
})
