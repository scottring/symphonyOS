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

  it('counts a recipe ONCE even when scheduled on multiple days (the 40-eggs bug)', () => {
    const frittata: Recipe = {
      id: 'batch', userId: 'u1', title: 'Weekly Frittata', ingredients: ['8 eggs', '1 cup whole milk'],
      instructions: [], tags: [], kidAcceptance: {}, isPrepFriendly: true, timesCooked: 0,
      createdAt: new Date(), updatedAt: new Date(),
    }
    // Same batch recipe on five breakfasts.
    const fivePlan: MealPlan = {
      ...plan,
      entries: [0, 1, 2, 3, 4].map(d => ({
        id: `b${d}`, mealPlanId: 'p1', dayOfWeek: d, slot: 'breakfast' as const, recipeId: 'batch', recipe: frittata,
      })),
    }
    const result = consolidateIngredients(fivePlan, [frittata])
    const eggs = result.find(i => /egg/i.test(i.text))
    expect(eggs?.text).toBe('8 eggs') // once, not 40
  })
})

describe('consolidateIngredients — canonical ingredient merge (the "basil x3" bug)', () => {
  function planOf(...ingredientsPerRecipe: string[][]): { plan: MealPlan; recipes: Recipe[] } {
    const recipes = ingredientsPerRecipe.map((ings, i) => ({
      id: `r${i}`, userId: 'u1', title: `R${i}`, ingredients: ings,
      instructions: [], tags: [], kidAcceptance: {}, isPrepFriendly: false, timesCooked: 0,
      createdAt: new Date(), updatedAt: new Date(),
    }))
    const plan: MealPlan = {
      id: 'p', userId: 'u1', weekStart: new Date('2026-04-27'),
      entries: recipes.map((r, i) => ({ id: `e${i}`, mealPlanId: 'p', dayOfWeek: i % 7, slot: 'dinner' as const, recipeId: r.id, recipe: r })),
      createdAt: new Date(), updatedAt: new Date(),
    }
    return { plan, recipes }
  }

  it('collapses every fresh-basil phrasing into ONE line', () => {
    const { plan, recipes } = planOf(
      ['1 cup fresh basil leaves'],
      ['1/2 cup fresh basil, torn'],
      ['½ cup Fresh basil, torn'],       // unicode fraction
      ['1 packed cup Fresh basil, torn'], // stray "packed"
      ['1 Tbsp. chopped fresh basil leaves'],
      ['Fresh basil (handful), torn'],    // no quantity
    )
    const result = consolidateIngredients(plan, recipes)
    const basil = result.filter(i => /basil/i.test(i.text))
    expect(basil).toHaveLength(1)
    expect(basil[0].fromRecipeIds.length).toBe(6)
  })

  it('does NOT merge basil with basil pesto (different item)', () => {
    const { plan, recipes } = planOf(
      ['1 cup fresh basil leaves'],
      ['3/4 cup basil pesto'],
    )
    const result = consolidateIngredients(plan, recipes)
    expect(result.filter(i => /basil/i.test(i.text)).length).toBe(2)
  })

  it('does not truncate on a quantity range dash ("¾–1 cup basil pesto")', () => {
    const { plan, recipes } = planOf(
      ['¾–1 cup Basil pesto, see [Fresh Basil Pesto](../x.md)'],
      ['¾ cup basil pesto'],
    )
    const result = consolidateIngredients(plan, recipes)
    const pesto = result.filter(i => /pesto/i.test(i.text))
    expect(pesto).toHaveLength(1)           // both are "basil pesto", one line
    expect(result.some(i => i.text.trim() === '')).toBe(false) // no blank line
  })

  it('still sums same-unit quantities into one clean line', () => {
    const { plan, recipes } = planOf(
      ['1 cup fresh basil leaves'],
      ['1/2 cup fresh basil leaves'],
    )
    const result = consolidateIngredients(plan, recipes)
    const basil = result.filter(i => /basil/i.test(i.text))
    expect(basil).toHaveLength(1)
    expect(basil[0].text).toMatch(/1 1\/2 cups/)
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

  it('merges the same ingredient into ONE line even across units/phrasings', () => {
    const a = makeRecipe('a', ['fresh parsley'])
    const b = makeRecipe('b', ['2 tbsp parsley, chopped'])
    // Canonical key is "parsley" for both — one shopping line, not two.
    const result = consolidateIngredients(planWith([a, b]), [a, b])
    expect(result).toHaveLength(1)
    expect(result[0].fromRecipeIds).toEqual(['a', 'b'])
    expect(result[0].text).toMatch(/parsley/i)
  })

  it('produces one line when quantities cannot be summed (mixed units)', () => {
    const a = makeRecipe('a', ['1 cup parsley'])
    const b = makeRecipe('b', ['1 bunch parsley'])
    // Same ingredient, un-summable units (cup vs bunch) — still ONE line.
    const result = consolidateIngredients(planWith([a, b]), [a, b])
    expect(result.length).toBe(1)
    expect(result[0].text).toMatch(/parsley/i)
  })
})
