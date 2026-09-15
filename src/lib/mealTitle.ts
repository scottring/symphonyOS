import { splitRecipeTitleUrl } from '@/lib/recipeDetection'
import type { MealPlanEntry, Recipe } from '@/types/meal-planner'

const MEAL_PREFIXES = ['Dinner', 'Lunch', 'Breakfast', 'Snack']

/**
 * Parses a meal title into display parts.
 *
 *   "Dinner · Crispy tofu stir fry + brown rice + broccoli"
 *     → { title: "Crispy tofu stir fry", sides: "brown rice + broccoli" }
 *
 * Live meal data stores the entire string in one field; this is a UI-side split
 * so the card can render two rows (main + sides) without changing data shape.
 */
export function parseMealTitle(raw: string): { title: string; sides?: string } {
  let s = raw.trim()
  for (const p of MEAL_PREFIXES) {
    if (s.startsWith(`${p} · `)) {
      s = s.slice(p.length + 3) // strip "Dinner · "
      break
    }
  }
  const idx = s.indexOf(' + ')
  if (idx === -1) return { title: s, sides: undefined }
  return { title: s.slice(0, idx), sides: s.slice(idx + 3) }
}

/**
 * Resolve the display title for a meal-plan entry — the single source of
 * truth shared by the Plan grid (WeekGrid/SlotCell) and the
 * Today/Week/wall timeline synthesis (synthesizeMealEvents), so the two
 * surfaces can't drift on leftover rendering.
 *
 * Leftover entries (`leftoverFrom` set) never show their own recipe/ad-hoc
 * title — they resolve through the source entry, one hop only:
 *   - source missing (deleted)              → "Leftovers"
 *   - source is itself a leftover            → "Leftovers" (no recursive chase)
 *   - source has no resolvable own title     → "Leftovers"
 *   - otherwise                              → "Leftovers: <source title>"
 *
 * Non-leftover entries just resolve their own recipe title / ad-hoc title,
 * falling back to "(unnamed)".
 */
export function resolveMealTitle(
  entry: MealPlanEntry,
  entriesById: Map<string, MealPlanEntry>,
  recipesById: Map<string, Recipe>,
): string {
  if (entry.leftoverFrom) {
    const source = entriesById.get(entry.leftoverFrom)
    if (!source || source.leftoverFrom) return 'Leftovers'
    const sourceTitle = ownMealTitle(source, recipesById)
    return sourceTitle ? `Leftovers: ${sourceTitle}` : 'Leftovers'
  }
  return ownMealTitle(entry, recipesById) ?? '(unnamed)'
}

function ownMealTitle(entry: MealPlanEntry, recipesById: Map<string, Recipe>): string | undefined {
  if (entry.recipeId) return recipesById.get(entry.recipeId)?.title
  // An ad-hoc entry has no URL column, so a pasted recipe link lives in the
  // title. Show the dish; adHocRecipeUrl() is where the link is picked up.
  return adHocMealName(entry)
}

/** The dish name from an ad-hoc title, with any pasted link taken out. */
export function adHocMealName(entry: MealPlanEntry): string | undefined {
  if (!entry.adHocTitle) return undefined
  return splitRecipeTitleUrl(entry.adHocTitle).name || undefined
}

/** A recipe link pasted into an ad-hoc title — the only place one can live for
 *  an entry with no recipe row. Resolves through a leftover, one hop, so
 *  "Leftovers: Golden tofu noodle bowl" still opens the noodle bowl. */
export function adHocRecipeUrl(
  entry: MealPlanEntry,
  entriesById: Map<string, MealPlanEntry>,
): string | null {
  const own = entry.leftoverFrom ? entriesById.get(entry.leftoverFrom) : entry
  if (!own || (entry.leftoverFrom && own.leftoverFrom)) return null
  if (own.recipeId) return null
  return splitRecipeTitleUrl(own.adHocTitle).url
}
