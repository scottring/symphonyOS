import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useMealPlan } from '@/hooks/useMealPlan'
import { useRecipes } from '@/hooks/useRecipes'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { useMealTracking } from '@/hooks/useMealTracking'
import { sundayOfWeek, dayLabelFor } from '@/lib/weekHelpers'
import { MEAL_SLOT_LABEL } from '@/types/meal-planner'

interface Props {
  /** Meal event id, e.g. "meal:<entry-id>". The entry id is the FIRST in the group. */
  mealEventId: string
  viewedDate: Date
}

export function MealEventSection({ mealEventId, viewedDate }: Props) {
  const navigate = useNavigate()
  const weekStart = useMemo(() => sundayOfWeek(viewedDate), [viewedDate])
  const { plan, refresh: mealRefresh } = useMealPlan(weekStart)
  const { recipes } = useRecipes()
  const { members } = useFamilyMembers()
  const { skipEntry, confirmAsPlanned } = useMealTracking(() => void mealRefresh())

  const entryId = mealEventId.replace(/^meal:/, '')
  const primaryEntry = plan?.entries.find(e => e.id === entryId)
  const recipe = primaryEntry?.recipeId ? recipes.find(r => r.id === primaryEntry.recipeId) : undefined

  // Notes draft state — must be declared before any early return so hook order
  // is consistent across renders.
  const [noteDraft, setNoteDraft] = useState(primaryEntry?.notes ?? '')
  const [marking, setMarking] = useState(false)

  useEffect(() => {
    setNoteDraft(primaryEntry?.notes ?? '')
  }, [primaryEntry?.id, primaryEntry?.notes])

  if (!primaryEntry) {
    return (
      <div className="p-5 text-[14px] text-neutral-500 italic">
        Meal entry not found. It may have been removed from the plan.
      </div>
    )
  }

  // All entries that share the same (day, slot, title) — these are the
  // per-person variants the timeline collapsed into one event.
  const sameSlotEntries = (plan?.entries ?? []).filter(e =>
    e.dayOfWeek === primaryEntry.dayOfWeek
    && e.slot === primaryEntry.slot
    && (
      (primaryEntry.recipeId && e.recipeId === primaryEntry.recipeId)
      || (!primaryEntry.recipeId && e.adHocTitle === primaryEntry.adHocTitle)
    )
  )

  const eaters = sameSlotEntries
    .map(e => e.familyMemberId
      ? (members.find(m => m.id === e.familyMemberId)?.name ?? '?')
      : 'Family')

  const title = recipe?.title ?? primaryEntry.adHocTitle ?? '(unnamed)'
  const slotLabel = MEAL_SLOT_LABEL[primaryEntry.slot] ?? primaryEntry.slot

  // -------- Leftover threading --------
  // Source: this entry came FROM another entry's leftovers.
  const leftoverSource = primaryEntry.leftoverFrom
    ? (plan?.entries ?? []).find(e => e.id === primaryEntry.leftoverFrom)
    : undefined

  const labelFor = (e: { dayOfWeek: number; slot: string; recipeId?: string; adHocTitle?: string }) => {
    const day = dayLabelFor(e.dayOfWeek)
    const slot = MEAL_SLOT_LABEL[e.slot as keyof typeof MEAL_SLOT_LABEL] ?? e.slot
    const t = e.recipeId
      ? (recipes.find(r => r.id === e.recipeId)?.title ?? '')
      : (e.adHocTitle ?? '')
    return t ? `${day} ${slot.toLowerCase()} · ${t}` : `${day} ${slot.toLowerCase()}`
  }

  // Destinations: other entries that draw FROM this one — but only count one
  // per day+slot bucket so per-person variants don't appear N times.
  const dependentEntries = (plan?.entries ?? []).filter(e => e.leftoverFrom === primaryEntry.id)
  const dependentBuckets = Array.from(
    new Map(
      dependentEntries.map(e => [`${e.dayOfWeek}:${e.slot}:${e.recipeId ?? e.adHocTitle ?? ''}`, e]),
    ).values(),
  )

  // -------- Handlers --------
  const handleMarkCooked = async () => {
    if (!recipe) return
    setMarking(true)
    const { error } = await supabase.from('recipes').update({
      times_cooked: recipe.timesCooked + 1,
      last_cooked_at: new Date().toISOString(),
    }).eq('id', recipe.id)
    setMarking(false)
    if (error) console.error('mark cooked failed:', error.message)
  }

  const handleSkip = async () => {
    await skipEntry(primaryEntry.id)
  }

  const handleRestore = async () => {
    await confirmAsPlanned(primaryEntry.id)
  }

  const commitNote = async () => {
    const next = noteDraft.trim()
    if (next === (primaryEntry.notes ?? '').trim()) return
    const { error } = await supabase
      .from('meal_plan_entries')
      .update({ notes: next || null })
      .eq('id', primaryEntry.id)
    if (error) {
      console.error('save note failed:', error.message)
      return
    }
    void mealRefresh()
  }

  const isSkipped = primaryEntry.trackingState === 'skipped'

  return (
    <div className="space-y-5 p-5">
      {/* Skipped indicator */}
      {isSkipped && (
        <div className="font-display italic text-[13px] text-accent-500">
          Skipped tonight.
        </div>
      )}

      {/* Header */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary-500 mb-1">
          {dayLabelFor(primaryEntry.dayOfWeek)} · {slotLabel.toUpperCase()}
        </div>
        <h2 className="font-display text-[1.6rem] text-neutral-800 leading-tight">
          {title}
        </h2>
        {recipe?.prepMinutes != null && (
          <div className="mt-1 text-[12px] text-neutral-500">~{recipe.prepMinutes} min</div>
        )}
      </div>

      {/* Eaters */}
      {eaters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.18em] text-neutral-400">For:</span>
          {Array.from(new Set(eaters)).map(name => (
            <span key={name} className="px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 text-[12px]">
              {name}
            </span>
          ))}
        </div>
      )}

      {/* Kid acceptance */}
      {recipe?.acceptanceSentence && (
        <p className="font-display italic text-[15px] text-sage-500">
          {recipe.acceptanceSentence}
        </p>
      )}

      {/* Leftover source */}
      {leftoverSource && (
        <p className="font-display italic text-[13px] text-neutral-600">
          From: {labelFor(leftoverSource)}
        </p>
      )}

      {/* Leftover destinations */}
      {dependentBuckets.length > 0 && (
        <p className="font-display italic text-[13px] text-neutral-600">
          Feeds: {dependentBuckets.map(labelFor).join(' · ')}
        </p>
      )}

      {/* Ingredients */}
      {recipe && recipe.ingredients.length > 0 && (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-neutral-400 mb-2">
            Ingredients
          </div>
          <ul className="space-y-1">
            {recipe.ingredients.map((ing, i) => (
              <li key={i} className="text-[13.5px] text-neutral-700">{ing}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Instructions */}
      {recipe && recipe.instructions.length > 0 && (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-neutral-400 mb-2">
            Instructions
          </div>
          <ol className="space-y-1.5 list-decimal list-inside">
            {recipe.instructions.map((step, i) => (
              <li key={i} className="text-[13.5px] text-neutral-700 leading-relaxed">{step}</li>
            ))}
          </ol>
        </div>
      )}

      {/* Inline notes editor */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-neutral-400 mb-2">
          Notes
        </div>
        <textarea
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          onBlur={commitNote}
          placeholder="Notes for this meal…"
          rows={2}
          className="w-full px-3 py-2 rounded-md border border-neutral-200 bg-white
                     font-display italic text-[14px] text-neutral-700
                     placeholder:italic placeholder:text-neutral-400
                     focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400
                     resize-none"
        />
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 pt-2">
        {recipe && (
          <button
            onClick={handleMarkCooked}
            disabled={marking}
            className="px-4 py-2 rounded-full border border-primary-200 text-primary-700 text-[12px] font-medium hover:bg-primary-50 disabled:opacity-50"
          >
            {marking ? 'Saving…' : '✓ Mark as cooked'}
          </button>
        )}
        {!isSkipped && (
          <button
            onClick={handleSkip}
            className="px-4 py-2 rounded-full border border-neutral-200 text-neutral-700 text-[12px] hover:bg-neutral-50"
          >
            ⊘ Skip tonight
          </button>
        )}
        {isSkipped && (
          <button
            onClick={handleRestore}
            className="px-4 py-2 rounded-full border border-neutral-200 text-neutral-700 text-[12px] hover:bg-neutral-50"
          >
            ↶ Restore
          </button>
        )}
        {recipe && (
          <button
            onClick={() => navigate(`/meals/cook/${recipe.id}`)}
            className="px-4 py-2 rounded-full bg-primary-500 text-white text-[12px] font-medium hover:bg-primary-600"
          >
            Step by step ↗
          </button>
        )}
        <button
          onClick={() => navigate('/meals/plan')}
          className="px-4 py-2 rounded-full border border-neutral-200 text-neutral-700 text-[12px] hover:bg-neutral-50"
        >
          Open in Plan
        </button>
        {!recipe && primaryEntry.adHocTitle && (
          <button
            onClick={() => navigate('/meals/shelf')}
            className="text-[12px] italic text-primary-500 hover:text-primary-600"
          >
            Add to Memory Shelf →
          </button>
        )}
      </div>
    </div>
  )
}
