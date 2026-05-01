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

describe('consolidateIngredients — quantity aggregation + prep stripping', () => {
  function makeRecipe(id: string, ingredients: string[]): Recipe {
    return {
      id, userId: 'u1', title: id, ingredients,
      instructions: [], tags: [], kidAcceptance: {}, isPrepFriendly: false, timesCooked: 0,
      createdAt: new Date(), updatedAt: new Date(),
    }
  }
  function planWith(recipes: Recipe[]): MealPlan {
    return {
      id: 'p', userId: 'u1', weekStart: new Date('2026-04-27'),
      entries: recipes.map((r, i) => ({ id: `e${i}`, mealPlanId: 'p', dayOfWeek: i, slot: 'dinner', recipeId: r.id, recipe: r })),
      createdAt: new Date(), updatedAt: new Date(),
    }
  }

  it('merges "1 cucumber, diced" + "1 cucumber, sliced" into "2 cucumbers"', () => {
    const a = makeRecipe('a', ['1 cucumber, diced'])
    const b = makeRecipe('b', ['1 cucumber, sliced'])
    const result = consolidateIngredients(planWith([a, b]), [a, b])
    expect(result).toHaveLength(1)
    expect(result[0].text).toBe('2 cucumbers')
    expect(result[0].fromRecipeIds).toEqual(['a', 'b'])
  })

  it('sums quantities with shared unit: 1 cup + 1/2 cup → 1 1/2 cups', () => {
    const a = makeRecipe('a', ['1 cup whole milk'])
    const b = makeRecipe('b', ['1/2 cup whole milk'])
    const result = consolidateIngredients(planWith([a, b]), [a, b])
    expect(result).toHaveLength(1)
    expect(result[0].text).toBe('1 1/2 cups whole milk')
  })

  it('preserves single ingredient with quantity 1: "1 lemon, halved" → "1 lemon"', () => {
    const a = makeRecipe('a', ['1 lemon, halved'])
    const result = consolidateIngredients(planWith([a]), [a])
    expect(result[0].text).toBe('1 lemon')
  })

  it('does not pluralize ingredients without numerical quantity', () => {
    const a = makeRecipe('a', ['salt and pepper'])
    const b = makeRecipe('b', ['salt and pepper'])
    const result = consolidateIngredients(planWith([a, b]), [a, b])
    expect(result).toHaveLength(1)
    expect(result[0].text).toBe('salt and pepper')
    expect(result[0].fromRecipeIds).toEqual(['a', 'b'])
  })

  it('handles "tomato" → "tomatoes" via plural override', () => {
    const a = makeRecipe('a', ['1 tomato, diced'])
    const b = makeRecipe('b', ['2 tomato, sliced'])
    const result = consolidateIngredients(planWith([a, b]), [a, b])
    expect(result[0].text).toBe('3 tomatoes')
  })

  it('keeps separate rows when units differ (parsed cup vs unitless)', () => {
    const a = makeRecipe('a', ['fresh parsley'])
    const b = makeRecipe('b', ['2 tbsp parsley, chopped'])
    // Different keys (no-quantity "fresh parsley" vs "parsley|tbsp"). Two rows is correct.
    const result = consolidateIngredients(planWith([a, b]), [a, b])
    expect(result).toHaveLength(2)
  })

  it('falls back to first ingredient when quantities cannot be summed (mixed units)', () => {
    const a = makeRecipe('a', ['1 cup parsley'])
    const b = makeRecipe('b', ['1 bunch parsley'])
    // Same noun "parsley" but different units (cup vs bunch). With our key
    // including unit, these stay separate. (If keys ever merge, the fallback
    // is exercised; this test documents the current behavior.)
    const result = consolidateIngredients(planWith([a, b]), [a, b])
    expect(result.length).toBe(2)
  })
})
