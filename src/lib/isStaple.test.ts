import { describe, it, expect } from 'vitest'
import { isStaple } from './isStaple'
import type { ConsolidatedIngredient } from './consolidateIngredients'

const item = (text: string, category: ConsolidatedIngredient['category']): ConsolidatedIngredient =>
  ({ text, category, fromRecipeIds: ['r1'] })

describe('isStaple', () => {
  it('treats spices as staples', () => {
    expect(isStaple(item('cumin', 'Spices'))).toBe(true)
    expect(isStaple(item('2 tsp smoked paprika', 'Spices'))).toBe(true)
  })

  it('treats curated common pantry staples as staples', () => {
    expect(isStaple(item('2 tbsp olive oil', 'Pantry'))).toBe(true)
    expect(isStaple(item('1/2 cup flour', 'Pantry'))).toBe(true)
    expect(isStaple(item('salt', 'Other'))).toBe(true)
    expect(isStaple(item('2 tbsp soy sauce', 'Pantry'))).toBe(true)
  })

  it('does NOT treat things you usually buy as staples', () => {
    expect(isStaple(item('2 lb chicken breast', 'Meat'))).toBe(false)
    expect(isStaple(item('1 can black beans', 'Pantry'))).toBe(false)
    expect(isStaple(item('8 oz pasta', 'Pantry'))).toBe(false)
    expect(isStaple(item('4 tomatoes', 'Produce'))).toBe(false)
    expect(isStaple(item('8 eggs', 'Dairy'))).toBe(false)
  })
})
