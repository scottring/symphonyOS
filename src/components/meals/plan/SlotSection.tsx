import { MealRow } from './MealRow'
import { MEAL_SLOT_LABEL } from '@/types/meal-planner'
import type { MealPlanEntry, MealSlot, Recipe } from '@/types/meal-planner'

interface Props {
  slot: MealSlot
  entries: MealPlanEntry[]
  recipesById: Map<string, Recipe>
  /** entry.id → "from X" label, for leftover entries. */
  parentLabelById?: Map<string, string>
  onPick: () => void
  onReplace: (entryId: string) => void
  onRemove: (entryId: string) => void
  onConsolidate: (entries: MealPlanEntry[], shared: { recipeId?: string; adHocTitle?: string }) => void
}

/** One slot inside a day card. Renders an empty tap-to-add row, a single
 *  filled row, or — for legacy multi-entry data — a stack of rows with an
 *  affordance to collapse them back into one when they share a recipe or
 *  ad-hoc title. */
export function SlotSection({
  slot, entries, recipesById, parentLabelById,
  onPick, onReplace, onRemove, onConsolidate,
}: Props) {
  if (entries.length === 0) {
    return (
      <div className="border-b border-neutral-100 last:border-b-0">
        <MealRow
          slot={slot}
          entry={undefined}
          recipe={undefined}
          onPick={onPick}
          onReplace={onReplace}
          onRemove={onRemove}
        />
      </div>
    )
  }

  if (entries.length === 1) {
    const e = entries[0]
    return (
      <div className="border-b border-neutral-100 last:border-b-0">
        <MealRow
          slot={slot}
          entry={e}
          recipe={e.recipeId ? recipesById.get(e.recipeId) : undefined}
          parentLabel={parentLabelById?.get(e.id)}
          onPick={onPick}
          onReplace={onReplace}
          onRemove={onRemove}
        />
      </div>
    )
  }

  // Multiple entries in the same slot (legacy data). Detect whether they all
  // reference the same recipe/title so they can be collapsed into one row.
  const sharedIdentifier = (() => {
    const firstRecipeId = entries[0].recipeId
    if (firstRecipeId && entries.every(e => e.recipeId === firstRecipeId)) {
      return { recipeId: firstRecipeId }
    }
    const firstAdHoc = entries[0].adHocTitle
    if (firstAdHoc && !entries[0].recipeId && entries.every(e => e.adHocTitle === firstAdHoc && !e.recipeId)) {
      return { adHocTitle: firstAdHoc }
    }
    return null
  })()

  return (
    <div className="border-b border-neutral-100 last:border-b-0 py-1">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-400 pt-2 pb-1">
        {MEAL_SLOT_LABEL[slot]}
      </div>

      {entries.map(e => (
        <MealRow
          key={e.id}
          slot={slot}
          entry={e}
          recipe={e.recipeId ? recipesById.get(e.recipeId) : undefined}
          parentLabel={parentLabelById?.get(e.id)}
          onPick={onPick}
          onReplace={onReplace}
          onRemove={onRemove}
        />
      ))}

      {sharedIdentifier && (
        <button
          onClick={() => onConsolidate(entries, sharedIdentifier)}
          className="text-[11px] italic text-primary-500 hover:text-primary-600 transition-colors"
          title="Replace these entries with one row"
        >
          ↔ Make one row
        </button>
      )}
    </div>
  )
}
