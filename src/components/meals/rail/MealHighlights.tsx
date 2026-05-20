import type { WeekSummary } from '@/lib/mealHighlights'
import { Utensils, Sparkles } from 'lucide-react'

interface MealHighlightsProps {
  summary: WeekSummary
}

/**
 * Right-rail "Meal highlights" panel. Aggregates the week's dinner plan into
 * a digest: count of dinners, prep range, and recipes added this week.
 */
export function MealHighlights({ summary }: MealHighlightsProps) {
  const { dinnersPlanned, prepRange, newRecipesThisWeek } = summary
  const isEmpty = dinnersPlanned === 0

  return (
    <section
      aria-labelledby="rail-meal-highlights"
      className="card px-5 py-4 bg-bg-elevated border border-neutral-200/60"
    >
      <h2
        id="rail-meal-highlights"
        className="text-[11px] font-medium uppercase tracking-wide text-neutral-400 mb-3"
      >
        Meal highlights
      </h2>

      {isEmpty ? (
        <p className="flex items-center gap-2 text-[13px] text-neutral-500">
          <Utensils className="w-4 h-4 text-neutral-300 shrink-0" aria-hidden />
          <span>No dinners planned yet.</span>
        </p>
      ) : (
        <ul className="space-y-2">
          <li className="flex items-center gap-2 text-[13px] text-neutral-700">
            <Utensils className="w-4 h-4 text-primary-500 shrink-0" aria-hidden />
            <span>
              {dinnersPlanned} {dinnersPlanned === 1 ? 'dinner' : 'dinners'} planned
              {prepRange && <span className="text-neutral-500"> · {prepRange}</span>}
            </span>
          </li>
          {newRecipesThisWeek > 0 && (
            <li className="flex items-center gap-2 text-[13px] text-neutral-700">
              <Sparkles className="w-4 h-4 text-amber-500 shrink-0" aria-hidden />
              <span>
                {newRecipesThisWeek} new {newRecipesThisWeek === 1 ? 'recipe' : 'recipes'} this week
              </span>
            </li>
          )}
        </ul>
      )}
    </section>
  )
}
