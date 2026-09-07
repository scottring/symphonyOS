import { describe, it, expect } from 'vitest'
import { searchRecipes, pageOf, type WallRecipe } from './recipeSearch'

function r(title: string, over: Partial<WallRecipe> = {}): WallRecipe {
  return { id: title.toLowerCase().replace(/\W+/g, '-'), title, tags: [], lastCookedAt: null, prepMinutes: null, ...over }
}

const SHELF: WallRecipe[] = [
  r('Sheet-pan salmon'),
  r('Salmon burgers'),
  r('Chicken piccata', { tags: ['weeknight'] }),
  r('Grilled pizza night', { lastCookedAt: new Date('2026-09-01') }),
  r('Arugula salad'),
  r('Shakshuka', { tags: ['breakfast', 'quick'] }),
]

describe('searchRecipes', () => {
  it('with nothing typed, the ones you actually cook come first, then A–Z', () => {
    const out = searchRecipes(SHELF, '')
    expect(out[0].title).toBe('Grilled pizza night')
    expect(out.slice(1).map((x) => x.title)).toEqual([
      'Arugula salad', 'Chicken piccata', 'Salmon burgers', 'Shakshuka', 'Sheet-pan salmon',
    ])
  })

  // Typing on a wall is expensive — three letters has to be enough.
  it('matches a word anywhere in the title, not just the first', () => {
    expect(searchRecipes(SHELF, 'sal').map((x) => x.title)).toEqual([
      'Salmon burgers',      // the title starts with it
      'Arugula salad',       // a later word starts with it
      'Sheet-pan salmon',
    ])
  })

  it('is forgiving about case, spaces and hyphens', () => {
    expect(searchRecipes(SHELF, '  SHEET pan ').map((x) => x.title)).toEqual(['Sheet-pan salmon'])
    expect(searchRecipes(SHELF, 'sheetpan').map((x) => x.title)).toEqual(['Sheet-pan salmon'])
  })

  it('finds a recipe by tag when the title says nothing', () => {
    expect(searchRecipes(SHELF, 'breakfast').map((x) => x.title)).toEqual(['Shakshuka'])
  })

  it('ranks a title hit above a tag hit', () => {
    const shelf = [r('Quick bread'), r('Shakshuka', { tags: ['quick'] })]
    expect(searchRecipes(shelf, 'quick').map((x) => x.title)).toEqual(['Quick bread', 'Shakshuka'])
  })

  it('returns nothing rather than everything when nothing matches', () => {
    expect(searchRecipes(SHELF, 'zzz')).toEqual([])
  })
})

describe('pageOf', () => {
  const nine = Array.from({ length: 20 }, (_, i) => r(`R${i}`))

  it('cuts the list into pages of the size given', () => {
    expect(pageOf(nine, 0, 9).items).toHaveLength(9)
    expect(pageOf(nine, 2, 9).items).toHaveLength(2)
    expect(pageOf(nine, 0, 9).pages).toBe(3)
  })

  it('clamps a page that ran off the end — a wall never shows an empty grid', () => {
    expect(pageOf(nine, 99, 9).page).toBe(2)
    expect(pageOf(nine, -3, 9).page).toBe(0)
    expect(pageOf([], 0, 9)).toEqual({ items: [], page: 0, pages: 1 })
  })
})
