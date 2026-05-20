import type { MealPlan, Recipe } from '@/types/meal-planner'

export interface WeekSummary {
  dinnersPlanned: number
  /** e.g. "30–45 min", or null when no dinner recipe has prepMinutes set. */
  prepRange: string | null
  /** Recipes whose createdAt falls within the week-start..week-end span. */
  newRecipesThisWeek: number
}

/**
 * Aggregates a week's meal-plan + recipes into the summary numbers shown on
 * the MEAL HIGHLIGHTS panel. Pure — no React, no fetches.
 */
export function summarizeWeek(args: {
  plan: MealPlan | null
  recipes: Recipe[]
  weekStart: Date
}): WeekSummary {
  const { plan, recipes, weekStart } = args
  if (!plan) {
    return { dinnersPlanned: 0, prepRange: null, newRecipesThisWeek: 0 }
  }

  const dinnerEntries = plan.entries.filter((e) => e.slot === 'dinner')
  const dinnerDows = new Set(dinnerEntries.map((e) => e.dayOfWeek))
  const dinnersPlanned = dinnerDows.size

  const dinnerPreps: number[] = []
  for (const e of dinnerEntries) {
    if (!e.recipeId) continue
    const r = recipes.find((x) => x.id === e.recipeId)
    if (r?.prepMinutes != null) dinnerPreps.push(r.prepMinutes)
  }
  const prepRange =
    dinnerPreps.length === 0
      ? null
      : `${Math.min(...dinnerPreps)}–${Math.max(...dinnerPreps)} min`

  const weekStartMs = weekStart.getTime()
  const weekEndMs = weekStartMs + 7 * 24 * 60 * 60 * 1000
  const newRecipesThisWeek = recipes.filter((r) => {
    const t =
      r.createdAt instanceof Date
        ? r.createdAt.getTime()
        : new Date(r.createdAt).getTime()
    return t >= weekStartMs && t < weekEndMs
  }).length

  return { dinnersPlanned, prepRange, newRecipesThisWeek }
}
