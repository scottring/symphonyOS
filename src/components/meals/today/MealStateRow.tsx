import { useState } from 'react'
import type { MealPlanEntry, Recipe, TrackingState } from '@/types/meal-planner'
import { sumGramsInTags } from './grams'

interface Props {
  entry: MealPlanEntry
  recipe?: Recipe
  onConfirmAsPlanned: (entryId: string) => void
  onSwap: (entryId: string, title: string, grams: string) => void
  onSkip: (entryId: string) => void
  onUndo?: (entryId: string) => void
  onRemove?: (entryId: string) => void
}

const SLOT_LABELS: Record<string, string> = {
  dinner: 'DINNER',
  lunch_iris: 'LUNCH',
  lunch_scott: 'LUNCH',
  prep: 'PREP',
  kid_alternate: 'KIDS',
}

function slotLabel(slot: string): string {
  return SLOT_LABELS[slot] ?? slot.toUpperCase()
}

/** A single row representing one meal-plan entry under tracking. */
export function MealStateRow({ entry, recipe, onConfirmAsPlanned, onSwap, onSkip, onUndo, onRemove }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftGrams, setDraftGrams] = useState('')

  const plannedTitle = recipe?.title ?? entry.adHocTitle ?? '(unnamed)'
  const plannedGramsHint = recipe ? sumGramsInTags(recipe.tags) : 0
  const state: TrackingState = entry.trackingState

  const startSwap = () => {
    setDraftTitle(entry.swapTitle ?? '')
    setDraftGrams(entry.swapGrams ?? '')
    setMenuOpen(false)
    setEditing(true)
  }

  const submitSwap = () => {
    if (!draftTitle.trim()) { setEditing(false); return }
    onSwap(entry.id, draftTitle.trim(), draftGrams.trim())
    setEditing(false)
  }

  return (
    <div className={`relative grid grid-cols-[110px_1fr_auto] gap-4 items-start py-3 border-b border-neutral-100 ${
      state === 'skipped' ? 'opacity-50' : ''
    }`}>
      <div className={`text-[10px] font-bold uppercase tracking-[0.18em] pt-1 ${
        state === 'added' ? 'text-primary-500' : 'text-neutral-400'
      }`}>
        {state === 'added' && '+ '}{slotLabel(entry.slot)}
      </div>

      <div>
        {/* Planned title — strikethrough if swapped or skipped */}
        <div className={`font-display text-[1.05rem] leading-tight text-neutral-800 ${
          state === 'swapped' || state === 'skipped' ? 'line-through text-neutral-400' : ''
        }`}>
          {plannedTitle}
          {plannedGramsHint > 0 && state === 'as_planned' && (
            <span className="ml-2 font-display italic text-[0.85rem] text-primary-500">{plannedGramsHint}g</span>
          )}
        </div>

        {/* Replacement line for swapped */}
        {state === 'swapped' && entry.swapTitle && (
          <div className="mt-1 font-display italic text-[0.95rem] text-primary-700">
            {entry.swapTitle}
            {entry.swapGrams && (
              <span className="ml-2 font-display italic text-[0.85rem] text-primary-500">{entry.swapGrams}</span>
            )}
          </div>
        )}

        {/* Inline grams for added */}
        {state === 'added' && entry.actualGrams && (
          <div className="mt-0.5 font-display italic text-[0.85rem] text-primary-500">
            {entry.actualGrams}
          </div>
        )}

        {/* Skipped explainer */}
        {state === 'skipped' && (
          <div className="mt-0.5 text-[12px] italic text-neutral-400">skipped</div>
        )}

        {/* Inline swap editor */}
        {editing && (
          <div className="mt-2 flex flex-wrap gap-2 items-center">
            <input value={draftTitle} onChange={e => setDraftTitle(e.target.value)} autoFocus
                   placeholder="What did you eat?"
                   className="px-2 py-1 text-[13px] rounded-md border border-neutral-200 bg-bg-base flex-1 min-w-[180px] focus:border-primary-500 focus:outline-none" />
            <input value={draftGrams} onChange={e => setDraftGrams(e.target.value)}
                   placeholder="grams"
                   className="px-2 py-1 text-[13px] rounded-md border border-neutral-200 bg-bg-base w-24 focus:border-primary-500 focus:outline-none" />
            <button onClick={submitSwap}
                    className="px-3 py-1 text-[12px] rounded-md bg-primary-500 text-white hover:bg-primary-600">save</button>
            <button onClick={() => setEditing(false)}
                    className="px-3 py-1 text-[12px] rounded-md text-neutral-500 hover:text-neutral-700">cancel</button>
          </div>
        )}
      </div>

      {/* Right column: state glyph or action menu */}
      <div className="relative pt-0.5">
        {state === 'as_planned' && (
          <button onClick={() => setMenuOpen(o => !o)}
                  aria-label="Mark as planned, swap, or skip"
                  className="text-[16px] text-neutral-300 hover:text-primary-500 px-1">
            ✓
          </button>
        )}
        {state === 'swapped' && (
          <button onClick={() => onUndo?.(entry.id)}
                  className="text-[11px] uppercase tracking-[0.12em] text-primary-500 hover:text-primary-600 italic">
            undo
          </button>
        )}
        {state === 'skipped' && (
          <button onClick={() => onUndo?.(entry.id)}
                  className="text-[11px] uppercase tracking-[0.12em] text-accent-500 hover:text-accent-600 italic">
            undo
          </button>
        )}
        {state === 'added' && onRemove && (
          <button onClick={() => onRemove(entry.id)}
                  aria-label="Remove added item"
                  className="text-[14px] text-neutral-300 hover:text-accent-500 px-1">
            ×
          </button>
        )}

        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 z-10 min-w-[160px] rounded-xl border border-neutral-200 bg-bg-elevated shadow-card py-1">
            <button onClick={() => { onConfirmAsPlanned(entry.id); setMenuOpen(false) }}
                    className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-primary-50 flex items-center gap-2">
              <span className="text-primary-500">✓</span> Ate as planned
            </button>
            <button onClick={startSwap}
                    className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-primary-50 flex items-center gap-2">
              <span className="text-primary-500">↔</span> Swapped
            </button>
            <button onClick={() => { onSkip(entry.id); setMenuOpen(false) }}
                    className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-accent-50 flex items-center gap-2">
              <span className="text-accent-500">⊘</span> Skipped
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
