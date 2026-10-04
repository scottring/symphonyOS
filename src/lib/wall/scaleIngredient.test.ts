import { describe, it, expect } from 'vitest'
import { scaleIngredient } from './scaleIngredient'

// Scott, 2026-10-04: "it's not showing the scaled recipe, only the base one,
// on the wall" — the wall scales a recipe ×2 / ×3 itself.
describe('scaleIngredient', () => {
  it('multiplies the leading amount', () => {
    expect(scaleIngredient('2 tbsp Dijon', 3)).toBe('6 tbsp Dijon')
    expect(scaleIngredient('1 1/4 lb salmon', 2)).toBe('2 1/2 lb salmon')
    expect(scaleIngredient('1/2 tsp chili powder', 3)).toBe('1 1/2 tsp chili powder')
    expect(scaleIngredient('½ cup Greek yogurt', 2)).toBe('1 cup Greek yogurt')
    expect(scaleIngredient('1¼ lb salmon', 2)).toBe('2 1/2 lb salmon')
  })

  it('scales a range at both ends', () => {
    expect(scaleIngredient('2–3 tbsp lemon juice', 2)).toBe('4–6 tbsp lemon juice')
  })

  it('leaves a line with no leading amount, and ×1, alone', () => {
    expect(scaleIngredient('Salt and pepper', 3)).toBe('Salt and pepper')
    expect(scaleIngredient('Cilantro', 2)).toBe('Cilantro')
    expect(scaleIngredient('2 tbsp Dijon', 1)).toBe('2 tbsp Dijon')
  })

  it('reads thirds and quarters sensibly', () => {
    expect(scaleIngredient('1/3 cup oil', 3)).toBe('1 cup oil')
    expect(scaleIngredient('3/4 cup milk', 2)).toBe('1 1/2 cup milk')
  })
})
