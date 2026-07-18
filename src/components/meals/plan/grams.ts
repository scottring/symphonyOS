import type { MealPlanEntry, Recipe } from '@/types/meal-planner'

/** Try to extract grams from a free-text label like "Apple 90g" or "~80g".
 *  Returns 0 on miss. */
export function extractGrams(text?: string | null): number {
  if (!text) return 0
  const m = text.match(/(\d{1,4})\s*g\b/i)
  return m ? parseInt(m[1], 10) : 0
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
