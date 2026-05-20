import type { ConsolidatedIngredient } from '@/lib/consolidateIngredients'
import { ShoppingBag, ChevronRight } from 'lucide-react'

interface PantryShelfRailProps {
  missingItems: ConsolidatedIngredient[]
  /** Opens the grocery review flow (existing surface on the Plan page). */
  onReview: () => void
}

const MAX_VISIBLE = 4

/**
 * Right-rail "Pantry & shelf" panel. Surfaces missing ingredients for the
 * current week's plan, with a click-through into the grocery review flow.
 */
export function PantryShelfRail({ missingItems, onReview }: PantryShelfRailProps) {
  const total = missingItems.length
  const visible = missingItems.slice(0, MAX_VISIBLE)
  const overflow = Math.max(0, total - MAX_VISIBLE)
  const isEmpty = total === 0

  return (
    <section
      aria-labelledby="rail-pantry-shelf"
      className="card px-5 py-4 bg-bg-elevated border border-neutral-200/60"
    >
      <h2
        id="rail-pantry-shelf"
        className="text-[11px] font-medium uppercase tracking-wide text-neutral-400 mb-3"
      >
        Pantry & shelf
      </h2>

      {isEmpty ? (
        <p className="flex items-center gap-2 text-[13px] text-neutral-500">
          <ShoppingBag className="w-4 h-4 text-neutral-300 shrink-0" aria-hidden />
          <span>Pantry is stocked for this week.</span>
        </p>
      ) : (
        <button
          type="button"
          onClick={onReview}
          aria-label="Review groceries"
          className="w-full text-left group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 rounded-md"
        >
          <div className="flex items-start gap-2">
            <ShoppingBag className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-neutral-700">
                {total} {total === 1 ? 'ingredient' : 'ingredients'} missing
              </p>
              <ul className="mt-1 space-y-0.5">
                {visible.map((item, i) => (
                  <li key={`${item.text}-${i}`} className="text-[12px] text-neutral-500 truncate flex items-center gap-1">
                    <span aria-hidden>·</span>
                    <span>{item.text}</span>
                  </li>
                ))}
                {overflow > 0 && (
                  <li className="text-[12px] text-neutral-400">+{overflow} more</li>
                )}
              </ul>
            </div>
            <ChevronRight
              className="w-4 h-4 text-neutral-300 shrink-0 mt-0.5 group-hover:text-neutral-500 transition-colors"
              aria-hidden
            />
          </div>
        </button>
      )}
    </section>
  )
}
