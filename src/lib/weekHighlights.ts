import type { MealPlan, Recipe } from '@/types/meal-planner'
import type { FamilyMember } from '@/types/family'
import type { ConsolidatedIngredient } from '@/lib/consolidateIngredients'

export interface AvatarSummary {
  id: string
  initials: string
  color: string
}

export interface FamilyDinnerSummary {
  nights: number
  avatars: AvatarSummary[]
}

export function familyDinnerSummary(
  plan: MealPlan | null,
  members: FamilyMember[],
  _weekStart: Date,
): FamilyDinnerSummary {
  const nights = plan
    ? new Set(plan.entries.filter((e) => e.slot === 'dinner').map((e) => e.dayOfWeek)).size
    : 0
  const avatars = members
    .filter((m) => m.member_type === 'core')
    .slice()
    .sort((a, b) => a.display_order - b.display_order)
    .map((m) => ({ id: m.id, initials: m.initials, color: m.color }))
  return { nights, avatars }
}

export interface GroceriesSummary {
  missingCount: number
}

export function groceriesSummary(missingItems: ConsolidatedIngredient[]): GroceriesSummary {
  return { missingCount: missingItems.length }
}

export interface PrepAheadSummary {
  recipeName: string
}

/**
 * Returns the recipe to prep tonight when tomorrow's dinner has prepMinutes > 30.
 * Null when no plan, no dinner tomorrow, no linked recipe, or prep ≤30 min.
 */
export function prepAheadSummary(
  plan: MealPlan | null,
  recipes: Recipe[],
  today: Date,
): PrepAheadSummary | null {
  if (!plan) return null
  const tomorrowDow = (today.getDay() + 1) % 7
  const tomorrowDinner = plan.entries.find(
    (e) => e.dayOfWeek === tomorrowDow && e.slot === 'dinner' && !!e.recipeId,
  )
  if (!tomorrowDinner?.recipeId) return null
  const recipe = recipes.find((r) => r.id === tomorrowDinner.recipeId)
  if (!recipe?.prepMinutes || recipe.prepMinutes <= 30) return null
  return { recipeName: recipe.title }
}
