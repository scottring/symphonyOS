import { describe, it, expect } from 'vitest'
import { parseMealTitle, resolveMealTitle } from './mealTitle'
import type { MealPlanEntry, Recipe } from '@/types/meal-planner'

describe('parseMealTitle', () => {
  it('returns the whole string as title when no separator', () => {
    expect(parseMealTitle('Tacos')).toEqual({ title: 'Tacos', sides: undefined })
  })

  it('strips a leading meal-type prefix ("Dinner · ")', () => {
    expect(parseMealTitle('Dinner · Tacos')).toEqual({ title: 'Tacos', sides: undefined })
  })

  it('splits the first " + " into title and sides', () => {
    expect(parseMealTitle('Crispy tofu stir fry + brown rice + broccoli')).toEqual({
      title: 'Crispy tofu stir fry',
      sides: 'brown rice + broccoli',
    })
  })

  it('combines prefix-strip and sides-split', () => {
    expect(
      parseMealTitle('Dinner · Crispy tofu stir fry + brown rice + broccoli + edamame + snap peas'),
    ).toEqual({
      title: 'Crispy tofu stir fry',
      sides: 'brown rice + broccoli + edamame + snap peas',
    })
  })

  it('handles "Lunch · " and "Breakfast · " prefixes too', () => {
    expect(parseMealTitle('Lunch · Caesar salad')).toEqual({ title: 'Caesar salad', sides: undefined })
    expect(parseMealTitle('Breakfast · Oatmeal')).toEqual({ title: 'Oatmeal', sides: undefined })
  })
})

describe('resolveMealTitle', () => {
  const recipe: Recipe = {
    id: 'r1', userId: 'u1', title: 'Sheet-pan chicken',
    ingredients: [], instructions: [], tags: [], kidAcceptance: {},
    isPrepFriendly: true, timesCooked: 0, createdAt: new Date(), updatedAt: new Date(),
  }
  const recipesById = new Map([[recipe.id, recipe]])

  it('resolves a recipe-backed entry to the recipe title', () => {
    const entry: MealPlanEntry = { id: 'e1', mealPlanId: 'p1', dayOfWeek: 1, slot: 'dinner', recipeId: 'r1' }
    expect(resolveMealTitle(entry, new Map(), recipesById)).toBe('Sheet-pan chicken')
  })

  it('resolves an ad-hoc entry to its title', () => {
    const entry: MealPlanEntry = { id: 'e1', mealPlanId: 'p1', dayOfWeek: 1, slot: 'dinner', adHocTitle: 'Taco night' }
    expect(resolveMealTitle(entry, new Map(), recipesById)).toBe('Taco night')
  })

  it('falls back to "(unnamed)" for a titleless, non-leftover entry', () => {
    const entry: MealPlanEntry = { id: 'e1', mealPlanId: 'p1', dayOfWeek: 1, slot: 'dinner' }
    expect(resolveMealTitle(entry, new Map(), recipesById)).toBe('(unnamed)')
  })

  it('resolves a leftover lunch to "Leftovers: <source title>"', () => {
    const source: MealPlanEntry = { id: 'e-mon', mealPlanId: 'p1', dayOfWeek: 1, slot: 'dinner', recipeId: 'r1' }
    const leftover: MealPlanEntry = { id: 'e-tue', mealPlanId: 'p1', dayOfWeek: 2, slot: 'lunch', leftoverFrom: 'e-mon' }
    const entriesById = new Map([[source.id, source], [leftover.id, leftover]])
    expect(resolveMealTitle(leftover, entriesById, recipesById)).toBe('Leftovers: Sheet-pan chicken')
  })

  it('renders plain "Leftovers" when the source entry was deleted', () => {
    const leftover: MealPlanEntry = { id: 'e-tue', mealPlanId: 'p1', dayOfWeek: 2, slot: 'lunch', leftoverFrom: 'gone' }
    expect(resolveMealTitle(leftover, new Map(), recipesById)).toBe('Leftovers')
  })

  it('renders plain "Leftovers" for a leftover-of-a-leftover, without recursing', () => {
    const source: MealPlanEntry = { id: 'e-mon', mealPlanId: 'p1', dayOfWeek: 1, slot: 'dinner', recipeId: 'r1' }
    const mid: MealPlanEntry = { id: 'e-tue', mealPlanId: 'p1', dayOfWeek: 2, slot: 'lunch', leftoverFrom: 'e-mon' }
    const leaf: MealPlanEntry = { id: 'e-wed', mealPlanId: 'p1', dayOfWeek: 3, slot: 'lunch', leftoverFrom: 'e-tue' }
    const entriesById = new Map([[source.id, source], [mid.id, mid], [leaf.id, leaf]])
    expect(resolveMealTitle(leaf, entriesById, recipesById)).toBe('Leftovers')
  })

  it('renders plain "Leftovers" when the source has no resolvable own title', () => {
    // AI-created leftover whose "source" itself carries no recipe/ad-hoc title
    // (edge case: shouldn't normally happen, but must not leak "(unnamed)").
    const source: MealPlanEntry = { id: 'e-mon', mealPlanId: 'p1', dayOfWeek: 1, slot: 'dinner' }
    const leftover: MealPlanEntry = { id: 'e-tue', mealPlanId: 'p1', dayOfWeek: 2, slot: 'lunch', leftoverFrom: 'e-mon' }
    const entriesById = new Map([[source.id, source], [leftover.id, leftover]])
    expect(resolveMealTitle(leftover, entriesById, recipesById)).toBe('Leftovers')
  })
})
