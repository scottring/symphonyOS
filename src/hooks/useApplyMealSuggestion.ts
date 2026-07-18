import { useCallback } from 'react'
import type { MealSlot } from '@/types/meal-planner'
import type { AskSymphonySuggestion } from '@/hooks/useAskSymphony'
import { useMealPlan } from '@/hooks/useMealPlan'

/** Shared apply path for meal suggestion cards.
 *
 *  Extracted verbatim from MealPlanRitualPage.onApplySuggestion so that the
 *  general assistant and the meal rail both call identical logic — no divergence
 *  bugs.  Reproduces the per-kind branching and console.warn/log traces from
 *  the original inline handler.
 *
 *  Note: per-person assignment (the familyMemberId name→id resolution this
 *  hook used to do before calling addMeal) was dropped along with
 *  AddMealInput.familyMemberId in the meal-planner rebuild's Task 1.
 */
export function useApplyMealSuggestion(
  weekStart: Date,
): {
  applySuggestion: (s: AskSymphonySuggestion) => Promise<void>
} {
  const { addMeal, removeMeal } = useMealPlan(weekStart)

  const applySuggestion = useCallback(async (s: AskSymphonySuggestion) => {
    console.log('[onApplySuggestion] applying card', s)
    try {
      if (s.kind === 'add') {
        const apply = s.apply as {
          dayOfWeek?: number; slot?: MealSlot
          recipeId?: string | null; adHocTitle?: string | null
        }
        if (typeof apply.dayOfWeek !== 'number' || !apply.slot) {
          throw new Error(`add card missing dayOfWeek/slot: ${JSON.stringify(apply)}`)
        }
        await addMeal({
          dayOfWeek: apply.dayOfWeek,
          slot: apply.slot,
          recipeId: apply.recipeId ?? undefined,
          adHocTitle: apply.adHocTitle ?? undefined,
        })
      } else if (s.kind === 'swap') {
        if (s.originalEntryId) await removeMeal(s.originalEntryId)
        const apply = s.apply as {
          dayOfWeek?: number; slot?: MealSlot
          recipeId?: string | null; adHocTitle?: string | null
        }
        if (typeof apply.dayOfWeek !== 'number' || !apply.slot) {
          throw new Error(`swap card missing dayOfWeek/slot: ${JSON.stringify(apply)}`)
        }
        await addMeal({
          dayOfWeek: apply.dayOfWeek,
          slot: apply.slot,
          recipeId: apply.recipeId ?? undefined,
          adHocTitle: apply.adHocTitle ?? undefined,
        })
      } else if (s.kind === 'remove') {
        const apply = s.apply as { entryId?: string }
        if (apply.entryId) await removeMeal(apply.entryId)
      }
      console.log('[onApplySuggestion] applied OK')
    } catch (e) {
      console.error('[onApplySuggestion] failed:', e)
      alert(`Couldn't apply: ${e instanceof Error ? e.message : String(e)}`)
    }
  }, [addMeal, removeMeal])

  return { applySuggestion }
}
