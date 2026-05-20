import { Utensils, ShoppingBag, ChefHat } from 'lucide-react'
import type { FamilyDinnerSummary, GroceriesSummary, PrepAheadSummary } from '@/lib/weekHighlights'

interface WeekSummaryRowProps {
  familyDinner: FamilyDinnerSummary
  groceries: GroceriesSummary
  prepAhead: PrepAheadSummary | null
}

export function WeekSummaryRow({ familyDinner, groceries, prepAhead }: WeekSummaryRowProps) {
  const showDinner = familyDinner.nights > 0
  const showGroceries = groceries.missingCount > 0
  const showPrep = !!prepAhead
  if (!showDinner && !showGroceries && !showPrep) return null

  return (
    <section aria-label="Week summary" className="flex items-stretch gap-3 mb-4">
      {showDinner && (
        <div className="card flex items-center gap-3 px-4 py-3 bg-bg-elevated border border-neutral-200/70 flex-1 min-w-0">
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
        </div>
      )}

      {showGroceries && (
        <div className="card flex items-center gap-3 px-4 py-3 bg-bg-elevated border border-neutral-200/70 flex-1 min-w-0">
          <ShoppingBag className="w-5 h-5 text-amber-500 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-neutral-800 truncate">Groceries</p>
            <p className="text-[11px] text-neutral-500">{groceries.missingCount} items missing</p>
          </div>
        </div>
      )}

      {showPrep && (
        <div className="card flex items-center gap-3 px-4 py-3 bg-bg-elevated border border-neutral-200/70 flex-1 min-w-0">
          <ChefHat className="w-5 h-5 text-primary-600 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-neutral-800 truncate">Prep ahead</p>
            <p className="text-[11px] text-neutral-500 truncate">Prep {prepAhead!.recipeName} tonight</p>
          </div>
        </div>
      )}
    </section>
  )
}
