import { describe, it, expect } from 'vitest'
import { consolidateIngredients } from './consolidateIngredients'
import type { MealPlan, Recipe } from '@/types/meal-planner'

const r1: Recipe = {
  id: 'r1', userId: 'u1', title: 'Pasta', ingredients: ['1 cup whole milk', '2 large eggs', '8 oz pasta'],
  instructions: [], tags: [], kidAcceptance: {}, isPrepFriendly: false, timesCooked: 0,
  createdAt: new Date(), updatedAt: new Date(),
}
const r2: Recipe = {
  id: 'r2', userId: 'u1', title: 'Omelet', ingredients: ['3 large eggs', '1/2 cup whole milk', 'salt'],
  instructions: [], tags: [], kidAcceptance: {}, isPrepFriendly: false, timesCooked: 0,
  createdAt: new Date(), updatedAt: new Date(),
}
const plan: MealPlan = {
  id: 'p1', userId: 'u1', weekStart: new Date('2026-04-27'),
  entries: [
    { id: 'e1', mealPlanId: 'p1', dayOfWeek: 0, slot: 'dinner', recipeId: 'r1', recipe: r1 },
    { id: 'e2', mealPlanId: 'p1', dayOfWeek: 2, slot: 'dinner', recipeId: 'r2', recipe: r2 },
  ],
  createdAt: new Date(), updatedAt: new Date(),
}

describe('consolidateIngredients', () => {
  it('walks all entries and collects ingredients', () => {
    const result = consolidateIngredients(plan, [r1, r2])
    expect(result.length).toBeGreaterThan(0)
  })

  it('dedupes ingredients shared across recipes', () => {
    const result = consolidateIngredients(plan, [r1, r2])
    const milkLines = result.filter(i => /milk/i.test(i.text))
    expect(milkLines.length).toBe(1)
    expect(milkLines[0].fromRecipeIds.length).toBe(2)
  })

  it('groups by category', () => {
    const result = consolidateIngredients(plan, [r1, r2])
    const dairy = result.filter(i => i.category === 'Dairy')
    expect(dairy.some(i => /milk/i.test(i.text))).toBe(true)
    expect(dairy.some(i => /egg/i.test(i.text))).toBe(true)
  })

  it('skips entries without recipes', () => {
    const adhocEntry = { ...plan.entries[0], recipeId: undefined, recipe: undefined, adHocTitle: 'free-text' }
    const planAdhoc = { ...plan, entries: [adhocEntry] }
    const result = consolidateIngredients(planAdhoc, [])
    expect(result.length).toBe(0)
  })
})
