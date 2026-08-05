import { useState, useCallback, useMemo } from 'react'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { PanelNotes } from './sections/PanelNotes'
import { PanelWhatToBring } from './sections/PanelWhatToBring'
import { PanelIngredients } from './sections/PanelIngredients'
import { PanelSteps } from './sections/PanelSteps'
import { PanelLinks } from './sections/PanelLinks'
import { PanelFooter } from './sections/PanelFooter'
import { sundayOfWeek } from '@/lib/weekHelpers'
import { useMealPlan } from '@/hooks/useMealPlan'
import { useRecipes } from '@/hooks/useRecipes'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { RecipePickerModal } from '@/components/meals/plan/RecipePickerModal'

interface TapMealPanelProps {
  /** Synthesized meal event; id is `meal:<meal_plan_entries.id>`. */
  event: CalendarEvent
  onClose: () => void
}

type AnyEvent = { start_time?: string; startTime?: string }
function getStartTime(e: CalendarEvent): string | undefined {
  return (e as AnyEvent).start_time || (e as AnyEvent).startTime
}

/** Meal-aware detail panel. Resolves the synthesized meal event back to its
 *  meal_plan_entries row and exposes recipe link/swap + remove via the
 *  existing useMealPlan write path and RecipePickerModal (which itself
 *  bundles library-pick + paste-URL + manual entry). */
export function TapMealPanel({ event, onClose }: TapMealPanelProps) {
  const entryId = event.id.startsWith('meal:') ? event.id.slice(5) : event.id
  const startIso = getStartTime(event)
  // Synthesized meal events always carry start_time; epoch fallback only
  // satisfies the type and keeps this deterministic (no impure Date.now()).
  const baseDate = useMemo(() => (startIso ? new Date(startIso) : new Date(0)), [startIso])
  const weekStart = useMemo(() => sundayOfWeek(baseDate), [baseDate])
  const { plan, addMeal, removeMeal } = useMealPlan(weekStart)
  const { recipes } = useRecipes()
  const { members: familyMembers } = useFamilyMembers()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

  const entry = plan?.entries.find(e => e.id === entryId)
  const recipe = entry?.recipeId ? recipes.find(r => r.id === entry.recipeId) : undefined

  const handlePick = useCallback(async (recipeId: string, _familyMemberId: string | null) => {
    setPickerOpen(false)
    if (!entry) return
    await removeMeal(entry.id)
    await addMeal({
      dayOfWeek: entry.dayOfWeek,
      slot: entry.slot,
      recipeId,
    })
    onClose()
  }, [entry, removeMeal, addMeal, onClose])

  const handleRemove = useCallback(async () => {
    if (entry) await removeMeal(entry.id)
    onClose()
  }, [entry, removeMeal, onClose])

  const timeDisplay = startIso
    ? new Date(startIso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) +
      ' • ' +
      new Date(startIso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : ''

  return (
    <article className="bg-bg-elevated rounded-2xl p-6 max-w-md w-full">
      {/* Header: title + close */}
      <div className="flex items-start justify-between gap-3 mb-1">
        <h2 className="font-display text-2xl text-neutral-900 leading-snug flex-1">{event.title}</h2>
        <button
          onClick={onClose}
          aria-label="Close"
          className="text-neutral-400 hover:text-neutral-700 text-xl leading-none mt-1 shrink-0"
        >
          ×
        </button>
      </div>
      {/* Date + time meta */}
      {timeDisplay && (
        <p className="text-[13px] text-neutral-500 mb-2">{timeDisplay}</p>
      )}
      {/* Meal chip */}
      <span className="inline-block text-[11px] px-2 py-0.5 rounded bg-neutral-100 text-neutral-500 mb-4">
        Meal
      </span>

      {/* Action row */}
      <div className="flex items-center justify-around pb-4 mb-4 border-b border-neutral-200">
        <button
          onClick={() => { /* meals: inert */ }}
          className="flex flex-col items-center gap-1 text-[11px] text-neutral-500 hover:text-neutral-700"
        >
          <svg className="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          Complete
        </button>
        <button
          onClick={() => setPickerOpen(true)}
          className="flex flex-col items-center gap-1 text-[11px] text-neutral-500 hover:text-neutral-700"
        >
          <svg className="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
          </svg>
          Edit
        </button>
        <button
          onClick={() => { /* meal reschedule: inert */ }}
          className="flex flex-col items-center gap-1 text-[11px] text-neutral-500 hover:text-neutral-700"
        >
          <svg className="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
          </svg>
          Move
        </button>
        <div className="relative">
          <button
            onClick={() => setMoreOpen(o => !o)}
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            className="flex flex-col items-center gap-1 text-[11px] text-neutral-500 hover:text-neutral-700"
          >
            <svg className="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z" />
            </svg>
            More
          </button>
          {moreOpen && (
            <>
              <button
                type="button"
                aria-label="Close menu"
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setMoreOpen(false)}
              />
              <div
                role="menu"
                className="absolute right-0 bottom-full mb-2 z-20 min-w-[180px] rounded-xl border border-neutral-200 bg-bg-elevated shadow-lg py-1"
              >
                <button
                  role="menuitem"
                  onClick={() => { setMoreOpen(false); handleRemove() }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-red-600 hover:bg-red-50 text-left"
                >
                  <svg className="w-4 h-4 shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  Remove from plan
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <PanelNotes
        key={entry?.id ?? event.id}
        notes={recipe?.title ? `Recipe: ${recipe.title}` : entry?.adHocTitle}
        onChange={() => { /* ABOUT derives from the recipe; read-only here */ }}
        label="ABOUT"
        id="meal-about"
      />
      <PanelWhatToBring notes={entry?.notes} />
      <PanelIngredients ingredients={recipe?.ingredients} />
      <PanelSteps steps={recipe?.instructions} />
      <PanelLinks links={recipe?.sourceUrl ? [{ url: recipe.sourceUrl, title: recipe.title }] : undefined} />

      <PanelFooter
        createdAt={baseDate}
        updatedAt={baseDate}
      />

      <RecipePickerModal
        isOpen={pickerOpen}
        slot={entry?.slot}
        familyMembers={familyMembers}
        onClose={() => setPickerOpen(false)}
        onPick={handlePick}
      />
    </article>
  )
}
