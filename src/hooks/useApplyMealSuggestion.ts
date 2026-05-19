import { useCallback } from 'react'
import type { MealSlot } from '@/types/meal-planner'
import type { FamilyMember } from '@/types/family'
import type { AskSymphonySuggestion } from '@/hooks/useAskSymphony'
import { useMealPlan } from '@/hooks/useMealPlan'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'

/** Shared apply path for meal suggestion cards.
 *
 *  Extracted verbatim from MealPlanRitualPage.onApplySuggestion so that the
 *  general assistant and the meal rail both call identical logic — no divergence
 *  bugs.  Reproduces the per-kind branching, the name→id fallback, and the
 *  console.warn/log traces from the original inline handler.
 *
 *  @param familyMembersOverride  When the caller already holds a fetched
 *    members array (e.g. MealPlanRitualPage), pass it here so the resolution
 *    logic uses that array instead of the hook's own fetch — keeping the two
 *    in sync and avoiding a divergence where the hook and the page see
 *    different snapshots.  Standalone consumers (Task 5 MealRequestCards) can
 *    omit this; the hook falls back to its own useFamilyMembers call.
 *    Note: useFamilyMembers() is always called unconditionally (React hooks
 *    rules); the override only controls which array the resolution logic uses.
 */
export function useApplyMealSuggestion(
  weekStart: Date,
  familyMembersOverride?: FamilyMember[],
): {
  applySuggestion: (s: AskSymphonySuggestion) => Promise<void>
} {
  const { addMeal, removeMeal } = useMealPlan(weekStart)
  const { members: ownMembers } = useFamilyMembers()
  const familyMembers = familyMembersOverride ?? ownMembers

  const applySuggestion = useCallback(async (s: AskSymphonySuggestion) => {
    console.log('[onApplySuggestion] applying card', s)
    try {
      if (s.kind === 'add') {
        const apply = s.apply as {
          dayOfWeek?: number; slot?: MealSlot
          recipeId?: string | null; adHocTitle?: string | null
          familyMemberId?: string | null
        }
        if (typeof apply.dayOfWeek !== 'number' || !apply.slot) {
          throw new Error(`add card missing dayOfWeek/slot: ${JSON.stringify(apply)}`)
        }
        // Defensive: if model emitted a name like "Iris" instead of a UUID,
        // resolve it; otherwise null (treat as family-default).
        let familyMemberId: string | null = apply.familyMemberId ?? null
        if (familyMemberId && !familyMembers.find(m => m.id === familyMemberId)) {
          const byName = familyMembers.find(m => m.name?.toLowerCase() === String(familyMemberId).toLowerCase())
          familyMemberId = byName?.id ?? null
          if (!byName) console.warn('[onApplySuggestion] unknown familyMemberId, fell back to family-default:', apply.familyMemberId)
        }
        await addMeal({
          dayOfWeek: apply.dayOfWeek,
          slot: apply.slot,
          recipeId: apply.recipeId ?? undefined,
          adHocTitle: apply.adHocTitle ?? undefined,
          familyMemberId,
        })
      } else if (s.kind === 'swap') {
        if (s.originalEntryId) await removeMeal(s.originalEntryId)
        const apply = s.apply as {
          dayOfWeek?: number; slot?: MealSlot
          recipeId?: string | null; adHocTitle?: string | null
          familyMemberId?: string | null
        }
        if (typeof apply.dayOfWeek !== 'number' || !apply.slot) {
          throw new Error(`swap card missing dayOfWeek/slot: ${JSON.stringify(apply)}`)
        }
        let familyMemberId: string | null = apply.familyMemberId ?? null
        if (familyMemberId && !familyMembers.find(m => m.id === familyMemberId)) {
          const byName = familyMembers.find(m => m.name?.toLowerCase() === String(familyMemberId).toLowerCase())
          familyMemberId = byName?.id ?? null
        }
        await addMeal({
          dayOfWeek: apply.dayOfWeek,
          slot: apply.slot,
          recipeId: apply.recipeId ?? undefined,
          adHocTitle: apply.adHocTitle ?? undefined,
          familyMemberId,
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
  }, [addMeal, removeMeal, familyMembers])

  return { applySuggestion }
}
