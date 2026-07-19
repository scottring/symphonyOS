import { useCallback, useRef, useState } from 'react'
import { Plus, ChevronUp, ChevronDown, X } from 'lucide-react'
import { dayLabelFor } from '@/lib/weekHelpers'
import { MEAL_SLOT_LABEL } from '@/types/meal-planner'
import { useClickOutside } from '@/hooks/useClickOutside'
import type { MealPlanEntry, MealSlot } from '@/types/meal-planner'

/** A per-person variant of a slot (Scott's lunch vs Iris's), with its resolved
 *  display title and the member's name for the chip. */
export interface MemberMeal {
  entry: MealPlanEntry
  memberName: string
  title: string
}

export interface SlotCellProps {
  dayOfWeek: number
  slot: MealSlot
  /** The shared / whole-family meal for this slot, if any. */
  entry?: MealPlanEntry
  /** Fully resolved display title for the shared entry. */
  title?: string
  /** Per-person variants for this slot (empty when the meal isn't split). */
  memberEntries?: MemberMeal[]
  /** Dinner cells only: whether "→ lunch tomorrow" is offered (false on Saturday). */
  canLeftoverTomorrow: boolean
  /** Empty cells only: whether "Leftovers from last night" is offered. */
  canLeftoverFromLastNight: boolean
  /** Title of the previous day's dinner, for the "Leftovers from last night" label. */
  previousDinnerTitle?: string
  /** Whether the shared meal can move up/down a cell (false at the ends of the week). */
  canMoveUp?: boolean
  canMoveDown?: boolean
  /** Change a meal. Pass a member's entry to change that variant; omit for the shared meal. */
  onChangeRecipe: (target?: MealPlanEntry) => void
  /** Clear a meal. Pass an entry id to clear that variant; omit for the shared meal. */
  onClear: (entryId?: string) => void
  onLeftoverTomorrow: () => void
  onPickRecipe: () => void
  onTypeName: (title: string) => void
  onLeftoverFromLastNight: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  /** Open the picker to add a per-person variant to this slot. */
  onAddForMember: () => void
}

/** One meal slot inside the week grid. Empty slots show a ghost "+" affordance;
 *  filled slots show the shared meal (title + move arrows + change/clear menu)
 *  and, when a meal diverges, a per-person row per member below it. Menus
 *  dismiss on outside-click / Escape. */
export function SlotCell({
  dayOfWeek, slot, entry, title, memberEntries = [],
  canLeftoverTomorrow, canLeftoverFromLastNight, previousDinnerTitle,
  canMoveUp = false, canMoveDown = false,
  onChangeRecipe, onClear, onLeftoverTomorrow,
  onPickRecipe, onTypeName, onLeftoverFromLastNight,
  onMoveUp, onMoveDown, onAddForMember,
}: SlotCellProps) {
  const [actionMenuOpen, setActionMenuOpen] = useState(false)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [typing, setTyping] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')

  const slotLabel = MEAL_SLOT_LABEL[slot]
  const dayLabel = dayLabelFor(dayOfWeek)

  const closeAddMenu = () => { setAddMenuOpen(false); setTyping(false); setDraftTitle('') }

  const menuRef = useRef<HTMLDivElement>(null)
  const closeMenus = useCallback(() => {
    setAddMenuOpen(false); setTyping(false); setDraftTitle(''); setActionMenuOpen(false)
  }, [])
  useClickOutside(menuRef, closeMenus, addMenuOpen || actionMenuOpen)

  const submitTypedName = () => {
    const trimmed = draftTitle.trim()
    if (!trimmed) return
    onTypeName(trimmed)
    closeAddMenu()
  }

  // Fully empty slot — the ghost "+" with its add menu.
  if (!entry && memberEntries.length === 0) {
    return (
      <div ref={menuRef} className="relative border-b border-dashed border-neutral-200 last:border-b-0 py-2">
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
                <button onClick={() => { closeAddMenu(); onPickRecipe() }} className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-primary-50">
                  Pick recipe
                </button>
                <button onClick={() => setTyping(true)} className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-primary-50">
                  Type name
                </button>
                <button onClick={() => { closeAddMenu(); onAddForMember() }} className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-primary-50">
                  Add for one person…
                </button>
                {canLeftoverFromLastNight && (
                  <button onClick={() => { closeAddMenu(); onLeftoverFromLastNight() }} className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-primary-50">
                    Leftovers from last night{previousDinnerTitle ? ` (${previousDinnerTitle})` : ''}
                  </button>
                )}
              </>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); submitTypedName() }} className="px-2 py-1.5">
                <input
                  autoFocus value={draftTitle}
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

  // Filled and/or split slot.
  return (
    <div ref={menuRef} className="relative py-2 border-b border-neutral-100 last:border-b-0">
      {/* Shared row (or a "split by person" placeholder when there's no shared meal). */}
      <div className="grid grid-cols-[80px_1fr_auto] items-start gap-3">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-400 pt-1">{slotLabel}</div>
        <div className="font-display text-[1rem] leading-tight text-neutral-800">
          {entry ? title : <span className="italic text-neutral-400 text-[0.95rem]">Just for specific people</span>}
        </div>
        <div className="flex items-center gap-0.5">
          {entry && (
            <>
              <button onClick={onMoveUp} disabled={!canMoveUp} aria-label={`Move ${slotLabel} for ${dayLabel} up`}
                className="p-0.5 text-neutral-300 hover:text-neutral-700 disabled:opacity-30 disabled:hover:text-neutral-300">
                <ChevronUp className="w-4 h-4" />
              </button>
              <button onClick={onMoveDown} disabled={!canMoveDown} aria-label={`Move ${slotLabel} for ${dayLabel} down`}
                className="p-0.5 text-neutral-300 hover:text-neutral-700 disabled:opacity-30 disabled:hover:text-neutral-300">
                <ChevronDown className="w-4 h-4" />
              </button>
            </>
          )}
          <div className="relative">
            <button
              onClick={() => setActionMenuOpen(o => !o)}
              aria-label={`${slotLabel} actions for ${dayLabel}`}
              className="px-2 text-neutral-400 hover:text-neutral-700 text-[14px]"
            >
              ⋯
            </button>
            {actionMenuOpen && (
              <div className="absolute right-0 top-full mt-1 z-10 min-w-[190px] rounded-xl border border-neutral-200 bg-bg-elevated shadow-card py-1">
                {entry ? (
                  <>
                    <button onClick={() => { setActionMenuOpen(false); onChangeRecipe() }} className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-primary-50">
                      Change recipe
                    </button>
                    <button onClick={() => { setActionMenuOpen(false); onClear() }} className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-accent-50 text-accent-500">
                      Clear
                    </button>
                    {slot === 'dinner' && (
                      <button onClick={() => { setActionMenuOpen(false); onLeftoverTomorrow() }} disabled={!canLeftoverTomorrow}
                        className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-primary-50 disabled:opacity-40 disabled:cursor-not-allowed">
                        → Lunch tomorrow
                      </button>
                    )}
                  </>
                ) : (
                  <button onClick={() => { setActionMenuOpen(false); onPickRecipe() }} className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-primary-50">
                    Add a shared meal
                  </button>
                )}
                <button onClick={() => { setActionMenuOpen(false); onAddForMember() }} className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-primary-50">
                  Add for one person…
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Per-person rows. */}
      {memberEntries.map(m => (
        <div key={m.entry.id} className="grid grid-cols-[80px_1fr_auto] items-center gap-3 mt-1">
          <span className="justify-self-start text-[10px] font-bold uppercase tracking-[0.12em] text-primary-600 bg-primary-50 rounded-full px-2 py-0.5">
            {m.memberName}
          </span>
          <button
            onClick={() => onChangeRecipe(m.entry)}
            className="text-left font-display text-[0.95rem] leading-tight text-neutral-700 hover:text-neutral-900"
          >
            {m.title}
          </button>
          <button
            onClick={() => onClear(m.entry.id)}
            aria-label={`Clear ${m.memberName}'s ${slotLabel.toLowerCase()}`}
            className="text-neutral-300 hover:text-accent-500 px-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
