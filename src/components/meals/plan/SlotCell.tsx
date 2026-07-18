import { useState } from 'react'
import { Plus } from 'lucide-react'
import { dayLabelFor } from '@/lib/weekHelpers'
import { MEAL_SLOT_LABEL } from '@/types/meal-planner'
import type { MealPlanEntry, MealSlot } from '@/types/meal-planner'

export interface SlotCellProps {
  dayOfWeek: number
  slot: MealSlot
  entry?: MealPlanEntry
  /** Fully resolved display title for a filled entry (via `resolveMealTitle`
   *  — already accounts for leftover-from-source resolution, so this is
   *  rendered verbatim, no further leftover logic here). */
  title?: string
  /** Dinner cells only: whether "→ lunch tomorrow" is offered (false on Saturday). */
  canLeftoverTomorrow: boolean
  /** Empty cells only: whether "Leftovers from last night" is offered. */
  canLeftoverFromLastNight: boolean
  /** Title of the previous day's dinner, for the "Leftovers from last night" label. */
  previousDinnerTitle?: string
  onChangeRecipe: () => void
  onClear: () => void
  onLeftoverTomorrow: () => void
  onPickRecipe: () => void
  onTypeName: (title: string) => void
  onLeftoverFromLastNight: () => void
}

/** One meal slot inside the week grid. Empty slots show a ghost "+"
 *  affordance with a pick/type/leftover menu; filled slots show the
 *  resolved title and a change/clear (+ leftover-tomorrow for dinner) menu. */
export function SlotCell({
  dayOfWeek, slot, entry, title,
  canLeftoverTomorrow, canLeftoverFromLastNight, previousDinnerTitle,
  onChangeRecipe, onClear, onLeftoverTomorrow,
  onPickRecipe, onTypeName, onLeftoverFromLastNight,
}: SlotCellProps) {
  const [actionMenuOpen, setActionMenuOpen] = useState(false)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [typing, setTyping] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')

  const slotLabel = MEAL_SLOT_LABEL[slot]
  const dayLabel = dayLabelFor(dayOfWeek)

  const closeAddMenu = () => { setAddMenuOpen(false); setTyping(false); setDraftTitle('') }

  const submitTypedName = () => {
    const trimmed = draftTitle.trim()
    if (!trimmed) return
    onTypeName(trimmed)
    closeAddMenu()
  }

  // Empty state.
  if (!entry) {
    return (
      <div className="relative border-b border-dashed border-neutral-200 last:border-b-0 py-2">
        <button
          type="button"
          onClick={() => setAddMenuOpen(o => !o)}
          aria-label={`Add ${slotLabel.toLowerCase()} for ${dayLabel}`}
          className="w-full grid grid-cols-[80px_1fr_auto] items-center gap-3 text-left rounded-lg px-1
                     hover:bg-primary-50/40 transition-colors"
        >
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-400">{slotLabel}</div>
          <div className="font-display italic text-[0.95rem] text-neutral-400">
            Add {slotLabel.toLowerCase()}…
          </div>
          <Plus className="w-4 h-4 text-neutral-300" aria-hidden />
        </button>

        {addMenuOpen && (
          <div className="absolute right-0 top-full mt-1 z-10 min-w-[200px] rounded-xl border border-neutral-200 bg-bg-elevated shadow-card py-1">
            {!typing ? (
              <>
                <button
                  onClick={() => { closeAddMenu(); onPickRecipe() }}
                  className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-primary-50"
                >
                  Pick recipe
                </button>
                <button
                  onClick={() => setTyping(true)}
                  className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-primary-50"
                >
                  Type name
                </button>
                {canLeftoverFromLastNight && (
                  <button
                    onClick={() => { closeAddMenu(); onLeftoverFromLastNight() }}
                    className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-primary-50"
                  >
                    Leftovers from last night{previousDinnerTitle ? ` (${previousDinnerTitle})` : ''}
                  </button>
                )}
              </>
            ) : (
              <form
                onSubmit={(e) => { e.preventDefault(); submitTypedName() }}
                className="px-2 py-1.5"
              >
                <input
                  autoFocus
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  onBlur={submitTypedName}
                  placeholder="Meal name…"
                  className="input-base text-[13px] py-1.5"
                />
              </form>
            )}
          </div>
        )}
      </div>
    )
  }

  // Filled state.
  return (
    <div className="relative grid grid-cols-[80px_1fr_auto] items-start gap-3 py-2 border-b border-neutral-100 last:border-b-0">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-400 pt-1">{slotLabel}</div>
      <div className="font-display text-[1rem] leading-tight text-neutral-800">
        {title}
      </div>
      <div className="relative">
        <button
          onClick={() => setActionMenuOpen(o => !o)}
          aria-label={`${slotLabel} actions for ${dayLabel}`}
          className="px-2 text-neutral-400 hover:text-neutral-700 text-[14px]"
        >
          ⋯
        </button>
        {actionMenuOpen && (
          <div className="absolute right-0 top-full mt-1 z-10 min-w-[170px] rounded-xl border border-neutral-200 bg-bg-elevated shadow-card py-1">
            <button
              onClick={() => { setActionMenuOpen(false); onChangeRecipe() }}
              className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-primary-50"
            >
              Change recipe
            </button>
            <button
              onClick={() => { setActionMenuOpen(false); onClear() }}
              className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-accent-50 text-accent-500"
            >
              Clear
            </button>
            {slot === 'dinner' && (
              <button
                onClick={() => { setActionMenuOpen(false); onLeftoverTomorrow() }}
                disabled={!canLeftoverTomorrow}
                className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-primary-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                → Lunch tomorrow
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
