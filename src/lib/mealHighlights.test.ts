import { describe, it, expect } from 'vitest'
import type { MealPlan, Recipe } from '@/types/meal-planner'
import { summarizeWeek } from './mealHighlights'

function mkRecipe(id: string, prep?: number, createdAt = new Date(2026, 0, 1)): Recipe {
  return {
    id,
    userId: 'u1',
    title: `r-${id}`,
    sourceUrl: undefined,
    imageUrl: undefined,
    prepMinutes: prep,
    ingredients: [],
    instructions: [],
    tags: [],
    kidAcceptance: {},
    isPrepFriendly: false,
    timesCooked: 0,
    createdAt,
    updatedAt: new Date(2026, 0, 1),
  }
}

function mkPlan(entries: MealPlan['entries']): MealPlan {
  return {
    id: 'p1',
    userId: 'u1',
    weekStart: new Date(2026, 4, 17),
    parameter: undefined,
    entries,
    createdAt: new Date(2026, 0, 1),
    updatedAt: new Date(2026, 0, 1),
  }
}

describe('summarizeWeek', () => {
  it('returns zero dinners when plan is null', () => {
    const result = summarizeWeek({ plan: null, recipes: [], weekStart: new Date() })
    expect(result.dinnersPlanned).toBe(0)
  })

  it('counts unique dinner entries per day-of-week', () => {
    const plan = mkPlan([
      { id: 'e1', mealPlanId: 'p1', dayOfWeek: 0, slot: 'dinner', recipeId: 'r1', trackingState: 'as_planned' },
      { id: 'e2', mealPlanId: 'p1', dayOfWeek: 1, slot: 'dinner', recipeId: 'r2', trackingState: 'as_planned' },
      { id: 'e3', mealPlanId: 'p1', dayOfWeek: 2, slot: 'lunch', recipeId: 'r3', trackingState: 'as_planned' },
    ])
    const result = summarizeWeek({ plan, recipes: [], weekStart: new Date() })
    expect(result.dinnersPlanned).toBe(2)
  })

  it('reports prep range as e.g. "30–45 min" when recipes provide minutes', () => {
    const plan = mkPlan([
      { id: 'e1', mealPlanId: 'p1', dayOfWeek: 0, slot: 'dinner', recipeId: 'r1', trackingState: 'as_planned' },
      { id: 'e2', mealPlanId: 'p1', dayOfWeek: 1, slot: 'dinner', recipeId: 'r2', trackingState: 'as_planned' },
    ])
    const result = summarizeWeek({
      plan,
      recipes: [mkRecipe('r1', 30), mkRecipe('r2', 45)],
      weekStart: new Date(),
    })
    expect(result.prepRange).toBe('30–45 min')
  })

  it('returns null prep range when no recipe has prepMinutes', () => {
    const plan = mkPlan([
      { id: 'e1', mealPlanId: 'p1', dayOfWeek: 0, slot: 'dinner', recipeId: 'r1', trackingState: 'as_planned' },
    ])
    const result = summarizeWeek({
      plan,
      recipes: [mkRecipe('r1', undefined)],
      weekStart: new Date(),
    })
    expect(result.prepRange).toBeNull()
  })

  it('counts recipes added within the current week as new', () => {
    const weekStart = new Date(2026, 4, 17) // May 17
    const justBefore = new Date(2026, 4, 16)
    const insideWeek = new Date(2026, 4, 19)
    const plan = mkPlan([
      { id: 'e1', mealPlanId: 'p1', dayOfWeek: 0, slot: 'dinner', recipeId: 'r-old', trackingState: 'as_planned' },
      { id: 'e2', mealPlanId: 'p1', dayOfWeek: 1, slot: 'dinner', recipeId: 'r-new', trackingState: 'as_planned' },
    ])
    const result = summarizeWeek({
      plan,
      recipes: [
        mkRecipe('r-old', 30, justBefore),
        mkRecipe('r-new', 30, insideWeek),
      ],
      weekStart,
    })
    expect(result.newRecipesThisWeek).toBe(1)
  })
})
