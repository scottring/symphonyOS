import { useEffect, useRef, useState } from 'react'
import type { MealPlanEntry, Recipe } from '@/types/meal-planner'
import { extractGrams, sumGramsInTags } from '../today/grams'

interface Props {
  /** All entries in the snack slot for the day (e.g. "Apple 90g", "Cherry tomatoes 80g"). */
  entries: MealPlanEntry[]
  recipesById: Map<string, Recipe>
  onAddItem?: () => void
  onCommitItem?: (entryId: string, next: string) => void | Promise<void>
}

interface Item {
  id: string
  label: string
  grams: number
}

/** The 3PM snack row collapses into a single editable column — no Iris/Scott
 *  split. Renders a comma-joined string of items + a total + an "+ add item"
 *  affordance. */
export function SnackEditRow({ entries, recipesById, onAddItem }: Props) {
  const items: Item[] = entries.map(e => {
    if (e.recipeId) {
      const r = recipesById.get(e.recipeId)
      const grams = sumGramsInTags(r?.tags)
      return { id: e.id, label: r?.title ?? e.adHocTitle ?? '(snack)', grams }
    }
    const title = e.adHocTitle ?? ''
    return { id: e.id, label: stripGrams(title) || '(snack)', grams: extractGrams(title) }
  })
  const total = items.reduce((sum, i) => sum + i.grams, 0)

  return (
    <div className="grid grid-cols-[88px_1fr] gap-4 py-5 border-b border-neutral-100 last:border-b-0">
      <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-neutral-400 pt-1">
        3PM SNACK
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {items.length === 0 ? (
          <span className="font-display italic text-[1rem] text-neutral-400">
            No snack items yet
          </span>
        ) : (
          items.map((item, i) => (
            <SnackItem
              key={item.id}
              label={item.label}
              grams={item.grams}
              showSeparator={i < items.length - 1}
            />
          ))
        )}
        {items.length > 0 && (
          <span className="font-display italic text-[1rem] text-primary-600 ml-1">
            = {total}g
          </span>
        )}
        <button
          type="button"
          onClick={onAddItem}
          className="ml-2 text-[12px] uppercase tracking-[0.12em] text-primary-500 italic
                     hover:text-primary-600 transition-colors"
        >
          + add item
        </button>
      </div>
    </div>
  )
}

function SnackItem({ label, grams, showSeparator }: { label: string; grams: number; showSeparator: boolean }) {
  return (
    <span className="font-display text-[1rem] text-neutral-800 leading-tight">
      {label}{' '}
      {grams > 0 && <span className="text-primary-500 italic">{grams}g</span>}
      {showSeparator && <span className="ml-2 text-neutral-300">·</span>}
    </span>
  )
}

/** "Apple 90g" → "Apple". */
function stripGrams(text: string): string {
  return text.replace(/~?\s*\d{1,4}\s*g\b/i, '').trim() || text
}

/** Inline edit variant used if we want to support edit-on-click later. Kept
 *  here behind a flag-free helper so we can swap renderers without touching
 *  callers. */
export function SnackItemEditable({
  initial, onCommit,
}: { initial: string; onCommit: (next: string) => void | Promise<void> }) {
  const [draft, setDraft] = useState(initial)
  const original = useRef(initial)
  useEffect(() => { setDraft(initial); original.current = initial }, [initial])

  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const next = draft.trim()
        if (next !== original.current.trim()) {
          original.current = next
          void onCommit(next)
        }
      }}
      className="font-display text-[1rem] text-neutral-800 bg-transparent outline-none
                 border-b border-transparent focus:border-primary-200 px-0.5"
    />
  )
}
