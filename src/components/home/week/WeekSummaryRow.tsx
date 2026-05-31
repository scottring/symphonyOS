import { useNavigate } from 'react-router-dom'
import { Utensils, ShoppingBag, ChefHat } from 'lucide-react'
import type { FamilyDinnerSummary, GroceriesSummary, PrepAheadSummary } from '@/lib/weekHighlights'
import { SHOW_PLANNED_MEALS_ON_TIMELINE } from '@/lib/mealsVisibility'

interface WeekSummaryRowProps {
  familyDinner: FamilyDinnerSummary
  groceries: GroceriesSummary
  prepAhead: PrepAheadSummary | null
}

const CARD_CLASS =
  'card flex items-center gap-3 px-4 py-3 bg-bg-elevated border border-neutral-200/70 flex-1 min-w-0 text-left transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40'

export function WeekSummaryRow({ familyDinner, groceries, prepAhead }: WeekSummaryRowProps) {
  const navigate = useNavigate()
  const showDinner = familyDinner.nights > 0
  // Hide the groceries card while planned meals are paused — the count is
  // derived from the meal planner, so it's noise until meals are live again.
  const showGroceries = SHOW_PLANNED_MEALS_ON_TIMELINE && groceries.missingCount > 0
  const showPrep = !!prepAhead
  if (!showDinner && !showGroceries && !showPrep) return null

  return (
    <section aria-label="Week summary" className="flex items-stretch gap-3 mb-4">
      {showDinner && (
        <button
          type="button"
          onClick={() => navigate('/meals/plan')}
          aria-label={`Family dinner — ${familyDinner.nights} nights this week. Open meal plan.`}
          className={CARD_CLASS}
        >
          <Utensils className="w-5 h-5 text-amber-600 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-neutral-800 truncate">Family dinner</p>
            <p className="text-[11px] text-neutral-500">{familyDinner.nights} nights this week</p>
          </div>
          {familyDinner.avatars.length > 0 && (
            <div className="flex -space-x-1.5 shrink-0">
              {familyDinner.avatars.slice(0, 4).map((a) => (
                <span
                  key={a.id}
                  className="inline-flex items-center justify-center w-6 h-6 rounded-full ring-2 ring-bg-elevated text-[9px] font-medium bg-neutral-100 text-neutral-700"
                  aria-hidden
                >
                  {a.initials}
                </span>
              ))}
            </div>
          )}
        </button>
      )}

      {showGroceries && (
        <button
          type="button"
          onClick={() => navigate('/meals/plan')}
          aria-label={`Groceries — ${groceries.missingCount} items missing. Open meal plan.`}
          className={CARD_CLASS}
        >
          <ShoppingBag className="w-5 h-5 text-amber-500 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-neutral-800 truncate">Groceries</p>
            <p className="text-[11px] text-neutral-500">{groceries.missingCount} items missing</p>
          </div>
        </button>
      )}

      {showPrep && (
        <button
          type="button"
          onClick={() => navigate('/meals/plan')}
          aria-label={`Prep ahead — ${prepAhead!.recipeName}. Open meal plan.`}
          className={CARD_CLASS}
        >
          <ChefHat className="w-5 h-5 text-primary-600 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-neutral-800 truncate">Prep ahead</p>
            <p className="text-[11px] text-neutral-500 truncate">Prep {prepAhead!.recipeName} tonight</p>
          </div>
        </button>
      )}
    </section>
  )
}
