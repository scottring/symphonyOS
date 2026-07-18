import { useState } from 'react'
import type { MealPlanEntry, MealSlot, Recipe } from '@/types/meal-planner'
import { MEAL_SLOT_LABEL } from '@/types/meal-planner'
import { sumGramsInTags } from './grams'
import { CookChip } from './CookChip'
import type { FamilyMember } from '@/types/family'

interface Props {
  slot: MealSlot
  entry?: MealPlanEntry
  recipe?: Recipe
  /** "Sun batch" / "Tue dinner" — rendered when the entry is a leftover. */
  parentLabel?: string
  onPick: () => void
  onReplace?: (entryId: string) => void
  onRemove?: (entryId: string) => void
  familyMembers?: FamilyMember[]
  onAssignCook?: (entryId: string, familyMemberId: string | null) => void
}

/** One meal slot inside a day card — surface 4 compact idiom.
 *  Empty slots are dashed-italic "tap for ideas" rows; filled slots show
 *  the recipe title + a kid-acceptance / grams hint. */
export function MealRow({ slot, entry, recipe, parentLabel, onPick, onReplace, onRemove, familyMembers, onAssignCook }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const slotLabel = MEAL_SLOT_LABEL[slot]
  const grams = recipe ? sumGramsInTags(recipe.tags) : 0

  // Empty
  if (!entry) {
    return (
      <button onClick={onPick}
              className="w-full grid grid-cols-[80px_1fr_auto] items-center gap-3 py-2 text-left
                         border-b border-dashed border-neutral-200 last:border-b-0
                         hover:bg-primary-50/40 transition-colors">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-400">
          {slotLabel}
        </div>
        <div className="font-display italic text-[1rem] text-neutral-400">
          {emptyCopy(slot)}
        </div>
        <div className="text-[11px] uppercase tracking-[0.12em] text-primary-500 italic">
          tap for ideas →
        </div>
      </button>
    )
  }

  const title = recipe?.title ?? entry.adHocTitle ?? '(unnamed)'

  return (
    <div className="relative grid grid-cols-[80px_1fr_auto] items-start gap-3 py-2 border-b border-neutral-100 last:border-b-0">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-400 pt-1">
        {slotLabel}
      </div>
      <div>
        <div className="font-display text-[1.05rem] leading-tight text-neutral-800">
          {title}
          {grams > 0 && (
            <span className="ml-2 font-display italic text-[0.85rem] text-primary-500">+{grams}g</span>
          )}
        </div>
        {recipe?.acceptanceSentence && (
          <div className="mt-0.5 font-display italic text-[0.85rem] text-sage-500">
            {recipe.acceptanceSentence}
          </div>
        )}
        {entry?.leftoverFrom && parentLabel && (
          <div className="font-display italic text-[12px] text-neutral-400 mt-0.5">
            from {parentLabel}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        {entry && familyMembers && onAssignCook && (
          <CookChip
            preparedBy={entry.preparedBy ?? null}
            members={familyMembers}
            onAssign={(id) => onAssignCook(entry.id, id)}
          />
        )}
        <div className="relative">
          <button onClick={() => setMenuOpen(o => !o)}
                  aria-label="Replace or remove"
                  className="px-2 text-neutral-400 hover:text-neutral-700 text-[14px]">
            ⋯
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 z-10 min-w-[140px] rounded-xl border border-neutral-200 bg-bg-elevated shadow-card py-1">
              <button onClick={() => { onReplace?.(entry.id); setMenuOpen(false) }}
                      className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-primary-50">
                Replace
              </button>
              <button onClick={() => { onRemove?.(entry.id); setMenuOpen(false) }}
                      className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-accent-50 text-accent-500">
                Remove
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function emptyCopy(slot: MealSlot): string {
  switch (slot) {
    case 'breakfast': return 'What for breakfast?'
    case 'lunch':     return 'What for lunch?'
    case 'snack':     return 'Snack?'
    case 'dinner':    return 'What for dinner?'
    case 'prep':      return 'Anything to batch-cook?'
    default:          return 'Add…'
  }
}
