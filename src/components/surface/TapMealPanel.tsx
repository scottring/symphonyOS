import { useState, useCallback, useMemo } from 'react'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { PanelHeader } from './sections/PanelHeader'
import { PanelMetaRow } from './sections/PanelMetaRow'
import { PanelActions } from './sections/PanelActions'
import { PanelWhy } from './sections/PanelWhy'
import { PanelWhatToBring } from './sections/PanelWhatToBring'
import { PanelIngredients } from './sections/PanelIngredients'
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

      <PanelActions
        completed={false}
        scheduledFor={startIso ? new Date(startIso) : undefined}
        isAllDay={false}
        isPinned={false}
        onToggleComplete={() => { /* meals have no complete path here (spec §6/§11) — inert */ }}
        onSchedule={() => { /* meal time derives from the plan slot; reschedule via Change recipe */ }}
        onTogglePin={() => { /* meals are not pinnable */ }}
        onDelete={handleRemove}
      />
      <button
        onClick={() => setPickerOpen(true)}
        className="text-xs px-3 py-1.5 rounded-lg font-medium bg-primary-50 text-primary-700 hover:bg-primary-100 transition-colors mb-4"
      >
        Change recipe
      </button>
      <PanelWhy
        key={entry?.id ?? event.id}
        notes={recipe?.title ? `Recipe: ${recipe.title}` : entry?.adHocTitle}
        onChange={() => { /* ABOUT derives from the recipe; read-only here */ }}
      />
      <PanelWhatToBring notes={entry?.notes} />
      <PanelIngredients ingredients={recipe?.ingredients} />
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
