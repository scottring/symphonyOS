// src/lib/mealGroceries.ts
//
// Keeps the Groceries list in step with the week's meals (2026-11-01).
//
// "Build shopping list" used to copy ingredients onto the list and forget where
// they came from. Now each ingredient the week needs has a line
// (meal_grocery_lines) saying which recipes need it and which list item it
// became, or that it was skipped (a staple, already on the list, or unticked
// when building). Once a week has been built, changing a meal updates the list:
//
//   - a new ingredient goes on the list (a staple, or one already listed by
//     hand, is skipped as the build would have done);
//   - an ingredient no meal needs any more is checked off, if still unbought;
//   - a changed amount rewrites the item, unless someone edited its words.
//
// An open item worded exactly as the builder words an ingredient is taken to
// be an earlier build's and adopted; anything typed by hand is left alone.
//
// Everything here is pure; useGroceryStatus applies the steps.

import type { ConsolidatedIngredient } from './consolidateIngredients'
import { isStaple } from './isStaple'

export interface MealGroceryLine {
  id: string
  ingredientKey: string
  recipeIds: string[]
  text: string
  listItemId: string | null
  skipped: boolean
}

export interface GroceryListItem {
  id: string
  text: string
  completed: boolean
}

export type MealGroceryStep =
  /** Put this ingredient on the list and remember it. With `lineId`, the
   *  ingredient was remembered as skipped and is now wanted after all. */
  | { kind: 'add'; item: ConsolidatedIngredient; lineId?: string }
  /** Remember this ingredient without listing it. */
  | { kind: 'skip'; item: ConsolidatedIngredient }
  /** Remember this ingredient as the open item already saying exactly it
   *  (left by an earlier build), so the item follows the plan from now on. */
  | { kind: 'link'; item: ConsolidatedIngredient; listItemId: string }
  /** No meal needs it: check off its item (when still open) and forget it. */
  | { kind: 'drop'; line: MealGroceryLine; checkOffItemId: string | null }
  /** Still needed, but by different recipes or in a different amount. */
  | { kind: 'update'; line: MealGroceryLine; item: ConsolidatedIngredient; rewriteItemId: string | null }

/** True when an open item already covers this ingredient — the build's own
 *  loose match, so hand-typed "Yogurt" stops "1 cup yogurt" being added. */
export function alreadyListed(item: ConsolidatedIngredient, openTexts: string[]): boolean {
  const key = item.text.toLowerCase()
  return openTexts.some(t => {
    const it = t.toLowerCase()
    return it.includes(key) || key.includes(it)
  })
}

/** An open item, not yet tied to any ingredient, worded exactly as the
 *  builder words this one — an earlier build's line, not something typed by
 *  hand, which is never checked off on a meal's account. */
function builtEarlier(item: ConsolidatedIngredient, items: GroceryListItem[], linked: Set<string>): GroceryListItem | undefined {
  // Exact, case included: the builder's wording is the signature.
  const text = item.text.trim()
  return items.find(i => !i.completed && !linked.has(i.id) && i.text.trim() === text)
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const s = new Set(a)
  return b.every(x => s.has(x))
}

/** The steps that bring a built week's list in line with what its meals need
 *  now. A week never built has no lines; it gets no steps until it is built. */
export function syncSteps(
  needed: ConsolidatedIngredient[],
  lines: MealGroceryLine[],
  items: GroceryListItem[],
): MealGroceryStep[] {
  if (lines.length === 0) return []
  const steps: MealGroceryStep[] = []
  const lineByKey = new Map(lines.map(l => [l.ingredientKey, l]))
  const itemById = new Map(items.map(i => [i.id, i]))
  const openTexts = items.filter(i => !i.completed).map(i => i.text)
  const linked = new Set(lines.flatMap(l => (l.listItemId ? [l.listItemId] : [])))
  const neededKeys = new Set<string>()

  for (const item of needed) {
    if (!item.key) continue
    neededKeys.add(item.key)
    const line = lineByKey.get(item.key)
    if (!line) {
      const earlier = builtEarlier(item, items, linked)
      if (earlier) {
        linked.add(earlier.id)
        steps.push({ kind: 'link', item, listItemId: earlier.id })
      } else {
        steps.push(isStaple(item) || alreadyListed(item, openTexts) ? { kind: 'skip', item } : { kind: 'add', item })
      }
      continue
    }
    if (line.text === item.text && sameSet(line.recipeIds, item.fromRecipeIds)) continue
    const listed = line.listItemId ? itemById.get(line.listItemId) : undefined
    const rewrite = listed && !listed.completed && listed.text === line.text && line.text !== item.text
    steps.push({ kind: 'update', line, item, rewriteItemId: rewrite ? listed.id : null })
  }

  for (const line of lines) {
    if (neededKeys.has(line.ingredientKey)) continue
    const listed = line.listItemId ? itemById.get(line.listItemId) : undefined
    steps.push({ kind: 'drop', line, checkOffItemId: listed && !listed.completed ? listed.id : null })
  }
  return steps
}

/** The steps for an explicit build: the ticked items go on the list, every
 *  other needed ingredient is remembered as skipped so a later meal change
 *  doesn't add what was deliberately left off. Lines already recorded stay. */
export function buildSteps(
  needed: ConsolidatedIngredient[],
  chosen: ConsolidatedIngredient[],
  lines: MealGroceryLine[],
  items: GroceryListItem[] = [],
): MealGroceryStep[] {
  const lineByKey = new Map(lines.map(l => [l.ingredientKey, l]))
  const known = new Set(lineByKey.keys())
  const chosenKeys = new Set(chosen.map(c => c.key))
  const steps: MealGroceryStep[] = []
  for (const item of chosen) {
    if (!item.key) continue
    const line = lineByKey.get(item.key)
    if (!line) steps.push({ kind: 'add', item })
    else if (line.skipped || !line.listItemId) steps.push({ kind: 'add', item, lineId: line.id })
  }
  const linked = new Set(lines.flatMap(l => (l.listItemId ? [l.listItemId] : [])))
  for (const item of needed) {
    if (!item.key || known.has(item.key) || chosenKeys.has(item.key)) continue
    const earlier = builtEarlier(item, items, linked)
    if (earlier) {
      linked.add(earlier.id)
      steps.push({ kind: 'link', item, listItemId: earlier.id })
    } else {
      steps.push({ kind: 'skip', item })
    }
  }
  return steps
}
