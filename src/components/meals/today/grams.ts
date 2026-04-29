import type { MealPlanEntry, MealParameter, Recipe } from '@/types/meal-planner'

/** Returns the gram target for a week parameter. Only '800g' has a target;
 *  other parameters get null and the gram block is hidden. */
export function gramsTargetFor(parameter?: MealParameter): number | null {
  return parameter === '800g' ? 1000 : null
}

/** Try to extract grams from a free-text label like "Apple 90g" or "~80g".
 *  Returns 0 on miss. */
export function extractGrams(text?: string | null): number {
  if (!text) return 0
  const m = text.match(/(\d{1,4})\s*g\b/i)
  return m ? parseInt(m[1], 10) : 0
}

/** Sum tracked grams for a list of entries:
 *  - 'as_planned'  → recipe-derived hint (sum of `~Ng` substrings on tags)
 *  - 'swapped'     → grams in swap_grams
 *  - 'skipped'     → 0
 *  - 'added'       → grams in actual_grams
 */
export function sumActualGrams(
  entries: MealPlanEntry[],
  recipesById: Map<string, Recipe>,
): number {
  let total = 0
  for (const e of entries) {
    if (e.trackingState === 'skipped') continue
    if (e.trackingState === 'swapped') { total += extractGrams(e.swapGrams); continue }
    if (e.trackingState === 'added') { total += extractGrams(e.actualGrams); continue }
    // as_planned: pull grams from recipe tags or notes
    if (e.recipeId) {
      const r = recipesById.get(e.recipeId)
      total += sumGramsInTags(r?.tags)
    }
    if (!e.recipeId && e.adHocTitle) {
      total += extractGrams(e.adHocTitle)
    }
  }
  return total
}

/** Iris uses tags like '~80g' to mark veg contribution per recipe. */
export function sumGramsInTags(tags?: string[]): number {
  if (!tags) return 0
  let n = 0
  for (const t of tags) n += extractGrams(t)
  return n
}

/** Same plumbing for calories — recipes can carry tags like '~520kcal'. */
export function extractKcal(text?: string | null): number {
  if (!text) return 0
  const m = text.match(/(\d{2,5})\s*kcal\b/i)
  return m ? parseInt(m[1], 10) : 0
}

export function sumKcalInTags(tags?: string[]): number {
  if (!tags) return 0
  let n = 0
  for (const t of tags) n += extractKcal(t)
  return n
}

export function sumPlannedKcal(
  entries: MealPlanEntry[],
  recipesById: Map<string, Recipe>,
): number {
  let n = 0
  for (const e of entries) {
    if (e.recipeId) n += sumKcalInTags(recipesById.get(e.recipeId)?.tags)
  }
  return n
}
