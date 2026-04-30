import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMealPlan } from '@/hooks/useMealPlan'
import { useRecipes } from '@/hooks/useRecipes'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { mondayOfWeek, dayLabelFor } from '@/lib/weekHelpers'
import { MEAL_SLOT_LABEL } from '@/types/meal-planner'

interface Props {
  /** Meal event id, e.g. "meal:<entry-id>". The entry id is the FIRST in the group. */
  mealEventId: string
  viewedDate: Date
}

export function MealEventSection({ mealEventId, viewedDate }: Props) {
  const navigate = useNavigate()
  const weekStart = useMemo(() => mondayOfWeek(viewedDate), [viewedDate])
  const { plan } = useMealPlan(weekStart)
  const { recipes } = useRecipes()
  const { members } = useFamilyMembers()

  const entryId = mealEventId.replace(/^meal:/, '')
  const primaryEntry = plan?.entries.find(e => e.id === entryId)
  const recipe = primaryEntry?.recipeId ? recipes.find(r => r.id === primaryEntry.recipeId) : undefined

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

  return (
    <div className="space-y-5 p-5">
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

      {/* Notes (per-entry) */}
      {primaryEntry.notes && (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-neutral-400 mb-1">
            Notes
          </div>
          <p className="font-display italic text-[14px] text-neutral-600">{primaryEntry.notes}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 pt-2">
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
