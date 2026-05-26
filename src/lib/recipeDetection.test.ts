import { describe, it, expect } from 'vitest'
import { detectRecipeUrl, isRecipeDomain, extractRecipeNameHint, resolveRecipeUrl } from './recipeDetection'

describe('recipeDetection', () => {
  describe('detectRecipeUrl', () => {
    it('returns null for null/undefined input', () => {
      expect(detectRecipeUrl(null)).toBeNull()
      expect(detectRecipeUrl(undefined)).toBeNull()
      expect(detectRecipeUrl('')).toBeNull()
    })

    it('detects allrecipes URLs', () => {
      const text = 'Make this for dinner: https://www.allrecipes.com/recipe/123/chicken-stir-fry'
      expect(detectRecipeUrl(text)).toBe('https://www.allrecipes.com/recipe/123/chicken-stir-fry')
    })

    it('detects NYT Cooking URLs', () => {
      const text = 'Recipe: https://cooking.nytimes.com/recipes/1234-roasted-chicken'
      expect(detectRecipeUrl(text)).toBe('https://cooking.nytimes.com/recipes/1234-roasted-chicken')
    })

    it('detects Serious Eats URLs', () => {
      const text = 'https://www.seriouseats.com/best-chocolate-chip-cookies'
      expect(detectRecipeUrl(text)).toBe('https://www.seriouseats.com/best-chocolate-chip-cookies')
    })

    it('detects bonappetit URLs', () => {
      const text = 'See https://www.bonappetit.com/recipe/pasta-carbonara for details'
      expect(detectRecipeUrl(text)).toBe('https://www.bonappetit.com/recipe/pasta-carbonara')
    })

    it('handles URLs with query parameters', () => {
      const text = 'https://www.allrecipes.com/recipe/123/dish?printView=true'
      expect(detectRecipeUrl(text)).toBe('https://www.allrecipes.com/recipe/123/dish?printView=true')
    })

    it('returns first recipe URL when multiple are present', () => {
      const text = 'Main: https://www.allrecipes.com/recipe/1 and also https://www.epicurious.com/recipe/2'
      expect(detectRecipeUrl(text)).toBe('https://www.allrecipes.com/recipe/1')
    })

    it('falls back to URLs containing /recipe in path', () => {
      const text = 'Check out https://somesite.com/recipes/lasagna'
      expect(detectRecipeUrl(text)).toBe('https://somesite.com/recipes/lasagna')
    })

    it('cleans trailing punctuation from URLs', () => {
      const text = 'Try this: https://www.allrecipes.com/recipe/123.'
      expect(detectRecipeUrl(text)).toBe('https://www.allrecipes.com/recipe/123')
    })

    it('returns null for non-recipe URLs', () => {
      const text = 'Meeting info at https://zoom.us/j/123456'
      expect(detectRecipeUrl(text)).toBeNull()
    })
  })

  describe('isRecipeDomain', () => {
    it('returns true for known recipe domains', () => {
      expect(isRecipeDomain('https://www.allrecipes.com/recipe/123')).toBe(true)
      expect(isRecipeDomain('https://cooking.nytimes.com/recipes/1234')).toBe(true)
      expect(isRecipeDomain('https://www.seriouseats.com/best-dish')).toBe(true)
    })

    it('returns false for non-recipe domains', () => {
      expect(isRecipeDomain('https://google.com')).toBe(false)
      expect(isRecipeDomain('https://zoom.us/meeting')).toBe(false)
    })

    it('handles malformed URLs gracefully', () => {
      expect(isRecipeDomain('not-a-url')).toBe(false)
    })
  })

  describe('extractRecipeNameHint', () => {
    it('extracts name after "Dinner:" prefix', () => {
      expect(extractRecipeNameHint('Dinner: Chicken Stir Fry')).toBe('Chicken Stir Fry')
    })

    it('extracts name after "Make:" prefix', () => {
      expect(extractRecipeNameHint('Make: Chocolate Cake')).toBe('Chocolate Cake')
    })

    it('handles "dinner" suffix', () => {
      expect(extractRecipeNameHint('Taco Tuesday dinner')).toBe('Taco Tuesday')
    })

    it('returns null for plain titles', () => {
      expect(extractRecipeNameHint('Team Meeting')).toBeNull()
    })

    it('is case insensitive', () => {
      expect(extractRecipeNameHint('DINNER: Pasta')).toBe('Pasta')
    })
  })

  describe('resolveRecipeUrl', () => {
    it('returns a bare URL directly, even from a non-allowlisted domain', () => {
      // A planned meal stores the recipe sourceUrl as the whole description.
      expect(resolveRecipeUrl('https://mygrandmasrecipes.io/tofu-stir-fry')).toBe(
        'https://mygrandmasrecipes.io/tofu-stir-fry',
      )
    })

    it('returns a bare allowlisted URL directly too', () => {
      expect(resolveRecipeUrl('https://www.seriouseats.com/x')).toBe('https://www.seriouseats.com/x')
    })

    it('trims surrounding whitespace on a bare URL', () => {
      expect(resolveRecipeUrl('  https://example.com/dish  ')).toBe('https://example.com/dish')
    })

    it('falls back to the recipe-domain heuristic for embedded URLs in free text', () => {
      expect(resolveRecipeUrl('Make this tonight: https://www.allrecipes.com/recipe/123 yum')).toBe(
        'https://www.allrecipes.com/recipe/123',
      )
    })

    it('returns null for empty / non-URL text', () => {
      expect(resolveRecipeUrl(null)).toBeNull()
      expect(resolveRecipeUrl('')).toBeNull()
      expect(resolveRecipeUrl('just a plain note')).toBeNull()
    })
  })
})
