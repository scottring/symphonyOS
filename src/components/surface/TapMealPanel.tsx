import { useState, useCallback, useMemo } from 'react'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { MoreHorizontal } from 'lucide-react'
import { PanelShell } from './PanelShell'
import { PanelHeader } from './sections/PanelHeader'
import { PanelFacts } from './sections/PanelFacts'
import { PanelActions } from './sections/PanelActions'
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
    <PanelShell
      identity={
      <div>
        <PanelHeader
          kind="Meal"
          title={event.title}
          // The title is the slot and the dish, derived from the plan entry.
          onTitleChange={() => { /* meal title is read-only */ }}
          onClose={onClose}
        />
        <PanelFacts
          facts={[
            { id: 'when', label: 'When', value: timeDisplay ? <span className="text-neutral-800">{timeDisplay}</span> : null },
            { id: 'recipe', label: 'Recipe', value: recipe?.title ? <span className="text-neutral-800">{recipe.title}</span> : null },
          ]}
        />
      </div>
      }
      act={
      // The shared action row (detail pane standard, 2026-10-19). The old row
      // of icon-over-label buttons carried a Complete and a Move that did
      // nothing when pressed; they are gone rather than restyled.
      <PanelActions
        actions={[
          ...(recipe?.sourceUrl
            ? [{ id: 'recipe', label: 'Open recipe', kind: 'primary' as const, href: recipe.sourceUrl }]
            : []),
          { id: 'edit', label: 'Change meal', onClick: () => setPickerOpen(true) },
        ]}
        overflow={
        <div className="relative">
          <button
            type="button"
            onClick={() => setMoreOpen(o => !o)}
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            aria-label="More"
            className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-neutral-300 bg-white text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden />
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
                className="absolute right-0 top-full mt-1 z-20 min-w-[180px] rounded-xl border border-neutral-200 bg-bg-elevated shadow-lg py-1"
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
        }
      />
      }
      details={
        <>
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

        </>
      }
      footer={
      <PanelFooter
        createdAt={baseDate}
        updatedAt={baseDate}
      />
      }
    >
      <RecipePickerModal
        isOpen={pickerOpen}
        slot={entry?.slot}
        familyMembers={familyMembers}
        onClose={() => setPickerOpen(false)}
        onPick={handlePick}
      />
    </PanelShell>
  )
}
