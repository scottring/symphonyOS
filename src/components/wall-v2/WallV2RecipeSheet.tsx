//
// The recipe picker, for someone standing at the wall with flour on their
// hands (Scott, 2026-09-07: "make recipes a searchable part of the wall").
//
// Kiosk rules, not web ones:
//  - No text field. The keys ARE the touch targets — 80px each, laid out A–Z
//    so a letter is where you left it, not where QWERTY put it. What you have
//    typed is shown at display size, not inside a 16px input.
//  - No scrolling. Nine tiles a page and a pair of full-height edge rails, the
//    same paging grammar the recipe viewer already uses for days.
//  - Nothing smaller than 0.7rem, nothing tappable smaller than 80px.
import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Delete, X } from 'lucide-react'
import { WALL } from './wallTheme'
import { searchRecipes, pageOf, type WallRecipe } from '@/lib/recipes/search'

const PER_PAGE = 9
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

interface Props {
  recipes: WallRecipe[]
  loading: boolean
  onPick: (recipe: WallRecipe) => void
  onClose: () => void
  /** What was typed last time. Held by the host so coming BACK from a recipe
   *  lands on the search you made, not on a blank shelf — the sheet unmounts
   *  while the cooking view is up. */
  query: string
  onQueryChange: (next: string) => void
}

export function WallV2RecipeSheet({ recipes, loading, onPick, onClose, query, onQueryChange }: Props) {
  const setQuery = onQueryChange
  const [page, setPage] = useState(0)

  const matches = useMemo(() => searchRecipes(recipes, query), [recipes, query])
  const { items, page: shownPage, pages } = pageOf(matches, page, PER_PAGE)

  const type = (ch: string) => { setQuery(query + ch); setPage(0) }
  const backspace = () => { setQuery(query.slice(0, -1)); setPage(0) }
  const clear = () => { setQuery(''); setPage(0) }

  return (
    <div className="fixed inset-0 z-50" data-testid="wall-recipe-sheet">
      <div data-testid="recipe-scrim" onClick={onClose} className="absolute inset-0 bg-black/50" />
      <div className={`absolute inset-x-0 bottom-0 top-0 ${WALL.root} flex flex-col p-6 gap-4`}>

        {/* What you've typed, at reading-across-the-kitchen size. */}
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <div className={WALL.label}>Recipes</div>
            <div className={`truncate text-[2rem] font-black leading-tight ${WALL.inkStrong}`}>
              {query || `All ${recipes.length}`}
              {query && <span className="animate-pulse">|</span>}
            </div>
          </div>
          <div className={`${WALL.label} shrink-0`}>
            {loading ? 'Loading…' : `${matches.length} match${matches.length === 1 ? '' : 'es'}`}
          </div>
          <button
            type="button" aria-label="Close" onClick={onClose}
            className={`${WALL.card} grid place-items-center w-20 h-20 shrink-0`}
          >
            <X className="w-7 h-7" />
          </button>
        </div>

        {/* The shelf: nine tiles, paged by the rails either side. */}
        <div className="flex-1 min-h-0 flex items-stretch gap-3">
          <PageRail
            side="prev" disabled={shownPage === 0}
            onTap={() => setPage((p) => Math.max(0, p - 1))}
          />
          <div className="flex-1 min-w-0 grid grid-cols-3 grid-rows-3 gap-3">
            {items.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onPick(r)}
                className={`${WALL.card} flex flex-col justify-center gap-2 px-5 py-4 text-left active:scale-[0.98] transition-transform`}
              >
                <span className={`line-clamp-3 text-[1.35rem] font-bold leading-snug ${WALL.inkStrong}`}>
                  {r.title}
                </span>
                {(r.prepMinutes || r.lastCookedAt) && (
                  <span className={`text-[0.8rem] font-bold ${WALL.muted}`}>
                    {[r.prepMinutes ? `${r.prepMinutes} min` : null,
                      r.lastCookedAt ? `Cooked ${r.lastCookedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : null]
                      .filter(Boolean).join(' · ')}
                  </span>
                )}
              </button>
            ))}
            {items.length === 0 && !loading && (
              <div className={`col-span-3 row-span-3 grid place-items-center text-center ${WALL.muted}`}>
                <div>
                  <div className="text-[1.4rem] font-bold">Nothing by that name.</div>
                  <button
                    type="button" onClick={clear}
                    className={`${WALL.card} mt-4 px-6 h-20 text-[1.05rem] font-semibold`}
                  >
                    Start over
                  </button>
                </div>
              </div>
            )}
          </div>
          <PageRail
            side="next" disabled={shownPage >= pages - 1}
            onTap={() => setPage((p) => p + 1)}
          />
        </div>

        {/* The keyboard. A–Z, because the alphabet is the one layout everyone
            in the house already knows by heart. */}
        <div className="shrink-0 grid grid-cols-[repeat(13,minmax(0,1fr))] gap-2">
          {LETTERS.map((ch) => (
            <button
              key={ch}
              type="button"
              onClick={() => type(ch)}
              className={`${WALL.cardInset} h-20 text-[1.5rem] font-black active:scale-95 transition-transform`}
            >
              {ch}
            </button>
          ))}
        </div>
        <div className="shrink-0 flex gap-2">
          <button
            type="button" onClick={() => type(' ')}
            className={`${WALL.cardInset} h-20 flex-1 text-[1.05rem] font-bold uppercase tracking-[0.15em] active:scale-95 transition-transform`}
          >
            Space
          </button>
          <button
            type="button" aria-label="Backspace" onClick={backspace}
            className={`${WALL.cardInset} h-20 w-32 grid place-items-center active:scale-95 transition-transform`}
          >
            <Delete className="w-7 h-7" />
          </button>
          <button
            type="button" onClick={clear}
            className={`${WALL.cardInset} h-20 w-40 text-[1.05rem] font-bold uppercase tracking-[0.15em] active:scale-95 transition-transform`}
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  )
}

/** A full-height page arrow. Disabled rather than hidden, so the grid never
 *  resizes under a finger — the same rule the recipe viewer's day rails follow. */
function PageRail({ side, disabled, onTap }: { side: 'prev' | 'next'; disabled: boolean; onTap: () => void }) {
  const Icon = side === 'prev' ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      aria-label={side === 'prev' ? 'Previous page' : 'Next page'}
      disabled={disabled}
      onClick={onTap}
      className={`${WALL.cardInset} w-20 shrink-0 grid place-items-center ${disabled ? 'opacity-25' : 'active:scale-95'} transition-transform`}
    >
      <Icon className="w-9 h-9" />
    </button>
  )
}
