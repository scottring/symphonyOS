import { describe, it, expect } from 'vitest'
import { ingredientWarnings } from './recipeParser'

describe('ingredientWarnings', () => {
  it('flags avocado in any ingredient, case-insensitive', () => {
    const warnings = ingredientWarnings(['2 ripe Avocados, diced', '1 lime'])
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/allergy/i)
  })

  it('flags avocado mid-string (e.g. "avocado oil")', () => {
    expect(ingredientWarnings(['1 tbsp avocado oil'])).toHaveLength(1)
  })

  it('returns empty for safe ingredients', () => {
    expect(ingredientWarnings(['1 cup rice', '2 eggs', 'guac-free salsa'])).toEqual([])
  })

  it('deduplicates: one warning even with multiple avocado ingredients', () => {
    expect(ingredientWarnings(['1 avocado', '2 avocados'])).toHaveLength(1)
  })
})
