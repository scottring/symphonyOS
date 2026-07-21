import { useState } from 'react'
import { Star, CornerRightDown, Archive, Trash2, Repeat } from 'lucide-react'
import type { Task } from '@/types/task'
import { PICK_CAP } from '@/lib/planning/betPulse'

/** The bench: open quarter items that aren't picks. Every row can be promoted
 *  ("Pick it") — at the cap, promoting expands an inline swap picker so one
 *  gesture replaces a current pick. The other exits re-grade or retire. */
export function OverflowTray({ items, picks, onPick, onSwap, onMakeMove, onShelf, onLetGo }: {
  items: readonly Task[]
  /** Current picks, for the at-cap swap picker. */
  picks: readonly Task[]
  onPick: (id: string) => void
  /** Swap: benchId becomes a pick, replacedPickId returns to the bench. */
  onSwap: (benchId: string, replacedPickId: string) => void
  onMakeMove: (id: string) => void
  onShelf: (id: string) => void
  onLetGo: (id: string) => void
}) {
  const [swapFor, setSwapFor] = useState<string | null>(null)
  if (items.length === 0) return null
  const atCap = picks.length >= PICK_CAP
  return (
    <section className="mt-8 pt-6 border-t border-neutral-200/70">
      <h3 className="text-sm font-medium text-neutral-500">On the bench ({items.length})</h3>
      <p className="text-[12px] text-neutral-400 mt-0.5 mb-3">
        A season holds 5–8 picks. Pick one up, turn it into a month move, shelf it, or let it go.
      </p>
      <ul className="space-y-1.5">
        {items.map((t) => (
          <li key={t.id} className="rounded-lg bg-neutral-50/80 border border-neutral-100 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="flex-1 min-w-0 text-sm text-neutral-600 truncate">{t.title}</span>
              <button type="button"
                onClick={() => (atCap ? setSwapFor(swapFor === t.id ? null : t.id) : onPick(t.id))}
                aria-expanded={atCap ? swapFor === t.id : undefined}
                className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md text-white bg-primary-600 hover:bg-primary-700 transition-colors">
                <Star aria-hidden="true" className="w-3 h-3" /> Pick it
              </button>
              <button type="button" onClick={() => onMakeMove(t.id)}
                className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md text-primary-700 bg-primary-50 hover:bg-primary-100 transition-colors">
                <CornerRightDown aria-hidden="true" className="w-3 h-3" /> Month move
              </button>
              <button type="button" onClick={() => onShelf(t.id)}
                className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md text-neutral-500 hover:bg-neutral-100 transition-colors">
                <Archive aria-hidden="true" className="w-3 h-3" /> Shelf
              </button>
              <button type="button" onClick={() => onLetGo(t.id)}
                className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md text-neutral-400 hover:text-danger-600 hover:bg-danger-50 transition-colors">
                <Trash2 aria-hidden="true" className="w-3 h-3" /> Let it go
              </button>
            </div>
            {/* At the cap, "Pick it" becomes a swap: choose which current pick
                this one replaces. One gesture, no orphaned ninth pick. */}
            {atCap && swapFor === t.id && (
              <div className="mt-2 rounded-md border border-primary-100 bg-primary-50/40 px-3 py-2">
                <p className="text-[11px] font-medium text-primary-800 mb-1.5 inline-flex items-center gap-1">
                  <Repeat aria-hidden="true" className="w-3 h-3" /> All {PICK_CAP} spots are taken — replace which pick?
                </p>
                <ul className="space-y-1">
                  {picks.map((p) => (
                    <li key={p.id}>
                      <button type="button"
                        onClick={() => { onSwap(t.id, p.id); setSwapFor(null) }}
                        className="w-full text-left text-[12px] text-neutral-700 truncate px-2 py-1 rounded hover:bg-white hover:text-primary-800 transition-colors">
                        {p.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
