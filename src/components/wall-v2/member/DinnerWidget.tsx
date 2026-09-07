import { UtensilsCrossed, ChefHat } from 'lucide-react'
import { WALL } from '../wallTheme'

/** Tonight, and one big tap into the recipe the wall already knows how to show. */
export function DinnerWidget({ tonight, onOpen }: { tonight: string | null; onOpen?: () => void }) {
  return (
    <section className={`${WALL.dinnerCard} p-4 flex flex-col min-h-0 min-w-0 overflow-hidden`}>
      <div className={`${WALL.dinnerLabel} shrink-0 mb-2 flex items-center gap-1.5`}>
        <UtensilsCrossed className="w-4 h-4" aria-hidden="true" />
        Dinner
      </div>
      <div className={`font-display text-[1.6rem] leading-tight truncate ${tonight ? WALL.inkStrong : WALL.warn}`}>
        {tonight ?? 'Nothing planned'}
      </div>
      {tonight && onOpen && (
        <button
          type="button"
          onClick={onOpen}
          aria-label="Open recipe"
          className={`mt-auto ${WALL.card} min-h-[56px] flex items-center justify-center gap-2 font-bold text-[1.05rem] active:scale-[.98] transition-transform`}
        >
          <ChefHat className="w-5 h-5" aria-hidden="true" />Open recipe
        </button>
      )}
    </section>
  )
}
