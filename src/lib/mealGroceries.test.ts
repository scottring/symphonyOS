import { describe, expect, it } from 'vitest'
import type { ConsolidatedIngredient } from './consolidateIngredients'
import { buildSteps, syncSteps, type GroceryListItem, type MealGroceryLine } from './mealGroceries'

const need = (key: string, text: string, recipes: string[], category: ConsolidatedIngredient['category'] = 'Produce'): ConsolidatedIngredient =>
  ({ key, text, category, fromRecipeIds: recipes })

const line = (key: string, text: string, recipes: string[], listItemId: string | null, skipped = false): MealGroceryLine =>
  ({ id: `line-${key}`, ingredientKey: key, text, recipeIds: recipes, listItemId, skipped })

const item = (id: string, text: string, completed = false): GroceryListItem => ({ id, text, completed })

describe('syncSteps', () => {
  it('does nothing for a week that was never built', () => {
    expect(syncSteps([need('tofu', '1 block tofu', ['r1'])], [], [])).toEqual([])
  })

  it('adds the ingredients of a meal added after the build', () => {
    const lines = [line('tofu', '1 block tofu', ['r1'], 'i1')]
    const items = [item('i1', '1 block tofu')]
    const cheese = need('brick cheese', '800 g brick cheese', ['pizza'], 'Dairy')
    const steps = syncSteps([need('tofu', '1 block tofu', ['r1']), cheese], lines, items)
    expect(steps).toEqual([{ kind: 'add', item: cheese }])
  })

  it('skips a new staple, and a new ingredient already on the list by hand', () => {
    const lines = [line('tofu', '1 block tofu', ['r1'], 'i1')]
    const items = [item('i1', '1 block tofu'), item('i2', 'Yogurt')]
    const oil = need('oil', '2 tbsp olive oil', ['r2'], 'Pantry')
    const yogurt = need('yogurt', 'yogurt', ['r2'], 'Dairy')
    const steps = syncSteps([need('tofu', '1 block tofu', ['r1']), oil, yogurt], lines, items)
    expect(steps).toEqual([{ kind: 'skip', item: oil }, { kind: 'skip', item: yogurt }])
  })

  it('checks off the ingredients of a removed meal that no other meal needs', () => {
    const lines = [line('tofu', '1 block tofu', ['r1'], 'i1'), line('ricotta', '1 cup ricotta', ['pasta'], 'i2')]
    const items = [item('i1', '1 block tofu'), item('i2', '1 cup ricotta')]
    const steps = syncSteps([need('tofu', '1 block tofu', ['r1'])], lines, items)
    expect(steps).toEqual([{ kind: 'drop', line: lines[1], checkOffItemId: 'i2' }])
  })

  it('leaves a bought item bought, and forgets a skipped line, when its meal goes', () => {
    const lines = [line('tofu', '1 block tofu', ['r1'], 'i1'), line('ricotta', '1 cup ricotta', ['pasta'], 'i2'), line('oil', 'oil', ['pasta'], null, true)]
    const items = [item('i1', '1 block tofu'), item('i2', '1 cup ricotta', true)]
    const steps = syncSteps([need('tofu', '1 block tofu', ['r1'])], lines, items)
    expect(steps).toEqual([
      { kind: 'drop', line: lines[1], checkOffItemId: null },
      { kind: 'drop', line: lines[2], checkOffItemId: null },
    ])
  })

  it('keeps an ingredient another meal still needs, rewriting its amount', () => {
    const lines = [line('garlic', '8 garlic cloves', ['a', 'b'], 'i1')]
    const items = [item('i1', '8 garlic cloves')]
    const now = need('garlic', '4 garlic cloves', ['a'])
    expect(syncSteps([now], lines, items)).toEqual([{ kind: 'update', line: lines[0], item: now, rewriteItemId: 'i1' }])
  })

  it('never rewrites words someone edited, or an item already bought', () => {
    const lines = [line('garlic', '8 garlic cloves', ['a', 'b'], 'i1'), line('squash', '1 butternut squash', ['a', 'b'], 'i2')]
    const items = [item('i1', 'Garlic (a head)'), item('i2', '1 butternut squash', true)]
    const garlic = need('garlic', '4 garlic cloves', ['a'])
    const squash = need('squash', '1/2 butternut squash', ['a'])
    expect(syncSteps([garlic, squash], lines, items)).toEqual([
      { kind: 'update', line: lines[0], item: garlic, rewriteItemId: null },
      { kind: 'update', line: lines[1], item: squash, rewriteItemId: null },
    ])
  })

  it('adopts an item an earlier build left, worded exactly as the builder words it', () => {
    const lines = [line('tofu', '1 block tofu', ['r1'], 'i1')]
    const items = [item('i1', '1 block tofu'), item('i2', '2 lb brussels sprouts'), item('i3', 'Yogurt')]
    const sprouts = need('brussels sprouts', '2 lb brussels sprouts', ['r2'])
    const yogurt = need('yogurt', '1 cup yogurt', ['r2'], 'Dairy')
    expect(syncSteps([need('tofu', '1 block tofu', ['r1']), sprouts, yogurt], lines, items)).toEqual([
      { kind: 'link', item: sprouts, listItemId: 'i2' },
      { kind: 'skip', item: yogurt },
    ])
  })

  it('settles: once its steps are applied a week has nothing left to do', () => {
    const lines = [line('tofu', '1 block tofu', ['r1'], 'i1')]
    const items = [item('i1', '1 block tofu')]
    expect(syncSteps([need('tofu', '1 block tofu', ['r1'])], lines, items)).toEqual([])
  })
})

describe('buildSteps', () => {
  it('lists the ticked items and remembers the rest as skipped', () => {
    const tofu = need('tofu', '1 block tofu', ['r1'])
    const oil = need('oil', '2 tbsp oil', ['r1'], 'Pantry')
    const basil = need('basil', 'Fresh basil', ['r2'])
    expect(buildSteps([tofu, oil, basil], [tofu], [])).toEqual([
      { kind: 'add', item: tofu },
      { kind: 'skip', item: oil },
      { kind: 'skip', item: basil },
    ])
  })

  it('adopts the items an earlier build left instead of skipping them', () => {
    const tofu = need('tofu', '1 block tofu', ['r1'])
    const basil = need('basil', 'Fresh basil', ['r2'])
    const items = [item('i1', 'Fresh basil'), item('i2', 'Tofu')]
    expect(buildSteps([tofu, basil], [], [], items)).toEqual([
      { kind: 'skip', item: tofu },
      { kind: 'link', item: basil, listItemId: 'i1' },
    ])
  })

  it('lists an ingredient skipped before when it is ticked now, and leaves listed ones alone', () => {
    const tofu = need('tofu', '1 block tofu', ['r1'])
    const oil = need('oil', '2 tbsp oil', ['r1'], 'Pantry')
    const lines = [line('tofu', '1 block tofu', ['r1'], 'i1'), line('oil', '2 tbsp oil', ['r1'], null, true)]
    expect(buildSteps([tofu, oil], [tofu, oil], lines)).toEqual([{ kind: 'add', item: oil, lineId: 'line-oil' }])
  })
})
