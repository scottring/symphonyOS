import { useState, useCallback, useMemo } from 'react'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { PanelHeader } from './sections/PanelHeader'
import { PanelMetaRow } from './sections/PanelMetaRow'
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
function formatTime(iso?: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
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

  const entry = plan?.entries.find(e => e.id === entryId)
  const recipe = entry?.recipeId ? recipes.find(r => r.id === entry.recipeId) : undefined

  const handlePick = useCallback(async (recipeId: string, familyMemberId: string | null) => {
    setPickerOpen(false)
    if (!entry) return
    await removeMeal(entry.id)
    await addMeal({
      dayOfWeek: entry.dayOfWeek,
      slot: entry.slot,
      recipeId,
      familyMemberId,
    })
    onClose()
  }, [entry, removeMeal, addMeal, onClose])

  const handleRemove = useCallback(async () => {
    if (entry) await removeMeal(entry.id)
    onClose()
  }, [entry, removeMeal, onClose])

  return (
    <article className="bg-bg-elevated rounded-2xl p-5 max-w-md w-full">
      <PanelHeader
        title={event.title}
        onTitleChange={() => { /* meal title derives from recipe/ad-hoc */ }}
        onClose={onClose}
      />
      <PanelMetaRow bucket={formatTime(startIso)} />

      <section className="py-4 mb-4 border-b border-neutral-200">
        <div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 mb-2">
          Recipe
        </div>
        {recipe ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-neutral-800">{recipe.title}</span>
            {recipe.sourceUrl && (
              <a
                href={recipe.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs px-2.5 py-1 rounded-md bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
              >
                Open recipe ↗
              </a>
            )}
          </div>
        ) : (
          <div className="text-sm text-neutral-600">
            {entry?.adHocTitle || 'No recipe linked'}
          </div>
        )}
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => setPickerOpen(true)}
            className="text-xs px-3 py-1.5 rounded-lg font-medium bg-primary-50 text-primary-700 hover:bg-primary-100 transition-colors"
          >
            Change recipe
          </button>
          <button
            onClick={handleRemove}
            className="text-xs px-3 py-1.5 rounded-lg font-medium bg-neutral-100 text-neutral-600 hover:bg-rose-50 hover:text-rose-600 transition-colors"
          >
            Remove from plan
          </button>
        </div>
      </section>

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
