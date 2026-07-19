import { useState, useMemo, useCallback } from 'react'
import { ChevronLeft, ChevronRight, ShoppingBasket, MessageCircle } from 'lucide-react'
import { useMealPlan } from '@/hooks/useMealPlan'
import { useRecipes, type ManualRecipeInput } from '@/hooks/useRecipes'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { useMealPlannerChat } from '@/hooks/useMealPlannerChat'
import { useGroceryStatus } from '@/hooks/useGroceryStatus'
import { useMobile } from '@/hooks/useMobile'
import { sundayOfWeek, formatDateMonthDay, dayLabelFor } from '@/lib/weekHelpers'
import { WeekGrid } from './WeekGrid'
import { RecipePickerModal, type LeftoverCandidate } from './RecipePickerModal'
import { MealChatRail } from '../chat/MealChatRail'
import { MealChatSheet } from '../chat/MealChatSheet'
import { MealsTabs } from '../MealsTabs'
import { SendToGroceriesModalV2 } from '../groceries-v2/SendToGroceriesModalV2'
import type { MealPlanEntry, MealSlot } from '@/types/meal-planner'

function addWeeks(d: Date, weeks: number): Date {
  const next = new Date(d)
  next.setDate(next.getDate() + weeks * 7)
  return next
}

interface PickerState {
  dayOfWeek: number
  slot: MealSlot
  /** Set when replacing an existing entry ("Change recipe") rather than filling an empty slot. */
  replaceEntryId?: string
}

/** Chat-first Plan page — a live week grid (WeekGrid) fed by useMealPlan's
 *  realtime subscription, plus a chat rail (desktop) / bottom sheet (mobile)
 *  driven by useMealPlannerChat. Chat writes land in the DB via the edge
 *  function's own tool calls; this page never refetches on the chat's
 *  behalf — useMealPlan's postgres_changes subscription does that. */
export function PlanPage() {
  const [weekOffset, setWeekOffset] = useState(0)
  const weekStart = useMemo(() => addWeeks(sundayOfWeek(new Date()), weekOffset), [weekOffset])

  const { plan, loading, error, addMeal, removeMeal } = useMealPlan(weekStart)
  const { recipes, refresh: refreshRecipes, addManual } = useRecipes()
  const { members: familyMembers } = useFamilyMembers()
  const chat = useMealPlannerChat(weekStart)
  const isMobile = useMobile()
  const groceryStatus = useGroceryStatus(plan, recipes)

  const [picker, setPicker] = useState<PickerState | null>(null)
  const [groceriesOpen, setGroceriesOpen] = useState(false)
  const [chatSheetOpen, setChatSheetOpen] = useState(false)

  const recipesById = useMemo(() => new Map(recipes.map(r => [r.id, r])), [recipes])

  /** Leftover candidates for the RecipePickerModal's "Leftovers" tab:
   *  prep-friendly recipe-backed entries that aren't themselves leftovers. */
  const leftoverCandidates = useMemo<LeftoverCandidate[]>(() => {
    if (!plan) return []
    const out: LeftoverCandidate[] = []
    for (const e of plan.entries) {
      if (e.leftoverFrom) continue
      const recipe = e.recipeId ? recipesById.get(e.recipeId) : undefined
      if (recipe?.isPrepFriendly !== true) continue
      out.push({ entry: e, recipe, dayLabel: `${dayLabelFor(e.dayOfWeek)} ${e.slot}` })
    }
    return out
  }, [plan, recipesById])

  const handlePickRecipe = useCallback((dayOfWeek: number, slot: MealSlot) => {
    setPicker({ dayOfWeek, slot })
  }, [])

  const handleChangeRecipe = useCallback((dayOfWeek: number, slot: MealSlot, entry: MealPlanEntry) => {
    setPicker({ dayOfWeek, slot, replaceEntryId: entry.id })
  }, [])

  const handlePick = async (recipeId: string, _familyMemberId: string | null) => {
    if (!picker) return
    if (picker.replaceEntryId) await removeMeal(picker.replaceEntryId)
    await addMeal({ dayOfWeek: picker.dayOfWeek, slot: picker.slot, recipeId })
    // The picker has its own useRecipes instance and can add recipes this
    // page's instance never fetched — refresh so recipesById resolves titles.
    await refreshRecipes()
    setPicker(null)
  }

  const handlePickLeftover = async (parentEntryId: string, _familyMemberId: string | null) => {
    if (!picker) return
    if (picker.replaceEntryId) await removeMeal(picker.replaceEntryId)
    await addMeal({ dayOfWeek: picker.dayOfWeek, slot: picker.slot, leftoverFromId: parentEntryId })
    setPicker(null)
  }

  // Apply an AI-invented recipe: save it to the shelf, then fill the slot —
  // the new-recipe analogue of handlePick (respects "change recipe" replace).
  const handleApplyAiNew = async (input: ManualRecipeInput) => {
    if (!picker) return
    if (picker.replaceEntryId) await removeMeal(picker.replaceEntryId)
    const recipe = await addManual(input)
    await addMeal({ dayOfWeek: picker.dayOfWeek, slot: picker.slot, recipeId: recipe.id })
    await refreshRecipes()
    setPicker(null)
  }

  const handleTypeName = useCallback((dayOfWeek: number, slot: MealSlot, title: string) => {
    void addMeal({ dayOfWeek, slot, adHocTitle: title })
  }, [addMeal])

  const handleLeftoverFromLastNight = useCallback(
    (dayOfWeek: number, slot: MealSlot, sourceEntry: MealPlanEntry) => {
      void addMeal({ dayOfWeek, slot, leftoverFromId: sourceEntry.id })
    },
    [addMeal],
  )

  const handleLeftoverTomorrow = useCallback((dayOfWeek: number, entry: MealPlanEntry) => {
    if (dayOfWeek >= 6) return // Saturday dinner has no "tomorrow" in this week's grid.
    void addMeal({ dayOfWeek: dayOfWeek + 1, slot: 'lunch', leftoverFromId: entry.id })
  }, [addMeal])

  const handleClear = useCallback((entryId: string) => {
    void removeMeal(entryId)
  }, [removeMeal])

  const weekLabel = formatDateMonthDay(weekStart)

  return (
    <div className="px-6 py-6 max-w-7xl mx-auto">
      <MealsTabs />

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekOffset(o => o - 1)}
            aria-label="Previous week"
            className="p-2 rounded-full hover:bg-neutral-100 text-neutral-500"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="font-display text-[1.75rem] text-neutral-800 px-1">
            Week of <span className="italic text-primary-500">{weekLabel}</span>
          </h1>
          <button
            onClick={() => setWeekOffset(o => o + 1)}
            aria-label="Next week"
            className="p-2 rounded-full hover:bg-neutral-100 text-neutral-500"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        <button
          onClick={() => setGroceriesOpen(true)}
          className="btn-primary flex items-center gap-2 text-[14px]"
        >
          <ShoppingBasket className="w-4 h-4" />
          Build shopping list
        </button>
      </div>

      {loading && <div className="text-[12px] uppercase tracking-widest text-neutral-400">Loading…</div>}
      {error && <div className="text-accent-500">{error}</div>}

      {!loading && !error && (
        <div className="flex items-start gap-6">
          <WeekGrid
            weekStart={weekStart}
            entries={plan?.entries ?? []}
            recipesById={recipesById}
            onPickRecipe={handlePickRecipe}
            onTypeName={handleTypeName}
            onLeftoverFromLastNight={handleLeftoverFromLastNight}
            onChangeRecipe={handleChangeRecipe}
            onClear={handleClear}
            onLeftoverTomorrow={handleLeftoverTomorrow}
          />

          {!isMobile && (
            <div
              className="w-[380px] shrink-0 sticky top-6 card"
              style={{ height: 'calc(100vh - 8rem)' }}
            >
              <MealChatRail
                messages={chat.messages}
                busy={chat.busy}
                loadingHistory={chat.loadingHistory}
                toolActivity={chat.toolActivity}
                onSend={chat.send}
              />
            </div>
          )}
        </div>
      )}

      {isMobile && (
        <>
          <button
            onClick={() => setChatSheetOpen(true)}
            aria-label="Open chat"
            className="fixed bottom-6 right-6 z-30 w-14 h-14 rounded-full bg-primary-500 text-white shadow-elevated flex items-center justify-center"
          >
            <MessageCircle className="w-6 h-6" />
          </button>
          <MealChatSheet
            isOpen={chatSheetOpen}
            onClose={() => setChatSheetOpen(false)}
            messages={chat.messages}
            busy={chat.busy}
            loadingHistory={chat.loadingHistory}
            toolActivity={chat.toolActivity}
            onSend={chat.send}
          />
        </>
      )}

      <RecipePickerModal
        isOpen={picker !== null}
        slot={picker?.slot}
        familyMembers={familyMembers}
        leftoverCandidates={leftoverCandidates}
        weekStart={weekStart}
        dayOfWeek={picker?.dayOfWeek}
        onClose={() => setPicker(null)}
        onPick={handlePick}
        onPickLeftover={handlePickLeftover}
        onApplyNewRecipe={handleApplyAiNew}
      />

      {/* useGroceryStatus already filters `consolidated` against the household's
          current Groceries-list items internally (that's what `missingItems` is) —
          it doesn't expose the raw current-item texts. Pass the pre-filtered
          `missingItems` as the modal's `consolidated` and an empty
          `currentItemTexts` so the modal's own (redundant) filter is a no-op;
          net effect is identical to passing the true current items. */}
      <SendToGroceriesModalV2
        isOpen={groceriesOpen}
        onClose={() => setGroceriesOpen(false)}
        consolidated={groceryStatus.missingItems}
        groceriesListId={groceryStatus.groceriesListId}
        currentItemTexts={[]}
        onSent={() => setGroceriesOpen(false)}
      />
    </div>
  )
}

// Re-export shim so existing imports of PlannerPage continue to work.
export { PlanPage as PlannerPage }
