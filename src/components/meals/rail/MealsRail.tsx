import { useMemo } from 'react'
import type { MealPlan, Recipe } from '@/types/meal-planner'
import type { ConsolidatedIngredient } from '@/lib/consolidateIngredients'
import { summarizeWeek } from '@/lib/mealHighlights'
import { MealHighlights } from './MealHighlights'
import { PantryShelfRail } from './PantryShelfRail'
import { NextUpRail, type NextUpEvent } from './NextUpRail'

interface MealsRailProps {
  plan: MealPlan | null
  recipes: Recipe[]
  weekStart: Date
  missingItems: ConsolidatedIngredient[]
  nextUpEvents: NextUpEvent[]
  onReviewGroceries: () => void
  onViewCalendar: () => void
}

/**
 * Right-rail container used by both the Plan and Today meals tabs. Stacks
 * Meal highlights, Pantry & shelf, and Next up — each independently empty-
 * stated so the rail handles "no data yet" cases gracefully.
 */
export function MealsRail({
  plan,
  recipes,
  weekStart,
  missingItems,
  nextUpEvents,
  onReviewGroceries,
  onViewCalendar,
}: MealsRailProps) {
  const summary = useMemo(
    () => summarizeWeek({ plan, recipes, weekStart }),
    [plan, recipes, weekStart],
  )

  return (
    <div className="h-full flex flex-col gap-4 overflow-y-auto pr-1">
      <MealHighlights summary={summary} />
      <PantryShelfRail missingItems={missingItems} onReview={onReviewGroceries} />
      <NextUpRail events={nextUpEvents} onViewCalendar={onViewCalendar} />
    </div>
  )
}
