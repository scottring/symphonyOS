import { describe, it, expect } from 'vitest'
import { Car, Home, Calendar, Activity, CheckSquare } from 'lucide-react'
import { categoryIcon } from './categoryIcon'

describe('categoryIcon', () => {
  it('maps known categories to icon + tint', () => {
    expect(categoryIcon('errand').Icon).toBe(Car)
    expect(categoryIcon('chore').Icon).toBe(Home)
    expect(categoryIcon('event').Icon).toBe(Calendar)
    expect(categoryIcon('activity').Icon).toBe(Activity)
  })
  it('falls back to CheckSquare for plain task / unknown / undefined', () => {
    expect(categoryIcon('task').Icon).toBe(CheckSquare)
    expect(categoryIcon(undefined).Icon).toBe(CheckSquare)
    expect(categoryIcon('nonsense' as never).Icon).toBe(CheckSquare)
  })
  it('always returns a non-empty tailwind tint class', () => {
    for (const c of ['errand', 'chore', 'event', 'activity', 'task', undefined] as const) {
      expect(categoryIcon(c).tint).toMatch(/\bbg-/)
    }
  })
})
