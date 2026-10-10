// Cooking mode's view of a recipe (conversational canvas, slice 7): one big
// step at a time, with the ingredients that step and the next one use.
// Steps and ingredients come from the same recipe content WallRecipeViewer
// shows (stored recipe, else the parsed web page); quantities scale with
// scaleIngredient, the wall's one scaler.
//
// PURE.

import { formatIngredientNarrative } from '@/lib/recipeParser'
import { scaleIngredient } from '../scaleIngredient'

/** Section headers ("FOR THE SAUCE") and blank lines aren't ingredients. */
export function isIngredientLine(line: string): boolean {
  const t = line.trim()
  return !!t && t !== t.toUpperCase()
}

/** The words a step would use for an ingredient: "2 lb ground turkey, 93%
 *  lean" → ["ground turkey", "turkey"]. */
export function ingredientTerms(line: string): string[] {
  const name = formatIngredientNarrative(line).name
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .split(/[,;]/)[0]
    .replace(/^(of|the|a|an)\s+/, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!name) return []
  const words = name.split(' ').filter((w) => w.length > 2)
  const last = words[words.length - 1]
  const singular = last && last.endsWith('s') && last.length > 4 ? last.slice(0, -1) : null
  return [...new Set([name, ...(last ? [last] : []), ...(singular ? [singular] : [])])]
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Indices of `ingredients` that `step` mentions. */
export function ingredientsForStep(step: string, ingredients: string[]): number[] {
  const text = step.toLowerCase()
  const out: number[] = []
  ingredients.forEach((line, i) => {
    if (!isIngredientLine(line)) return
    if (ingredientTerms(line).some((term) => new RegExp(`\\b${escape(term)}`, 'i').test(text))) out.push(i)
  })
  return out
}

export interface ScaledLine { text: string; was: string | null }

/** An ingredient at the chosen servings, with what it said before ("was 1
 *  lb") when scaling changed it. */
export function scaledLine(line: string, factor: number): ScaledLine {
  const text = scaleIngredient(line, factor)
  return { text, was: text !== line ? line.match(/^\S+(?:\s+\d+\/\d+)?(?:\s*[–-]\s*\S+)?/)?.[0] ?? line : null }
}

/** Strip the viewer's **bold** marks for plain display. */
export function plainStep(step: string): string {
  return step.replace(/\*\*([^*]+)\*\*/g, '$1').trim()
}

/** A recipe's directions as cooking-mode steps: plain text, blanks dropped. */
export function cookingSteps(instructions: string[] | null | undefined): string[] {
  return (instructions ?? []).map(plainStep).filter(Boolean)
}
