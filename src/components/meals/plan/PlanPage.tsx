import { useState, useMemo, useCallback } from 'react'
import { ShoppingBasket, MessageCircle, SlidersHorizontal } from 'lucide-react'
import { useMealPlan } from '@/hooks/useMealPlan'
import { showToast } from '@/hooks/useToast'
import { useRecipes, type ManualRecipeInput } from '@/hooks/useRecipes'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { useMealPlannerChat } from '@/hooks/useMealPlannerChat'
import { useGroceryStatus } from '@/hooks/useGroceryStatus'
import { useMobile } from '@/hooks/useMobile'
import { sundayOfWeek, formatDateMonthDay, dayLabelFor, dateForDayOfWeek, activeDayRange } from '@/lib/weekHelpers'
import { WeekGrid } from './WeekGrid'
import { WeekRangePopover } from './WeekRangePopover'
import { RecipePickerModal, type LeftoverCandidate } from './RecipePickerModal'
import { MealPreferencesModal } from './MealPreferencesModal'
import { MealChatRail } from '../chat/MealChatRail'
import { MealChatSheet } from '../chat/MealChatSheet'
import { MastheadCard, PeriodNavEyebrow } from '@/components/layout/MastheadCard'
import { MealsTabs } from '../MealsTabs'
import { MOBILE_TAB_BAR_HEIGHT } from '@/shell/mobileChrome'
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
  /** Preselects the "for:" chip and is the member a new/AI-applied meal is written for. */
  forMemberId?: string
}

/** Chat-first Plan page — a live week grid (WeekGrid) fed by useMealPlan's
 *  realtime subscription, plus a chat rail (desktop) / bottom sheet (mobile)
 *  driven by useMealPlannerChat. Chat writes land in the DB via the edge
 *  function's own tool calls; this page never refetches on the chat's
 *  behalf — useMealPlan's postgres_changes subscription does that. */
export function PlanPage() {
  const [weekOffset, setWeekOffset] = useState(0)
  const weekStart = useMemo(() => addWeeks(sundayOfWeek(new Date()), weekOffset), [weekOffset])

  const { plan, loading, error, addMeal, removeMeal, moveMeal, setWeekRange } = useMealPlan(weekStart)
  const { recipes, refresh: refreshRecipes, addManual } = useRecipes()
  const { members: familyMembers } = useFamilyMembers()
  const chat = useMealPlannerChat(weekStart)
  const isMobile = useMobile()
  const groceryStatus = useGroceryStatus(plan, recipes)

  const [picker, setPicker] = useState<PickerState | null>(null)
  const [groceriesOpen, setGroceriesOpen] = useState(false)
  const [chatSheetOpen, setChatSheetOpen] = useState(false)
  const [prefsOpen, setPrefsOpen] = useState(false)

  const recipesById = useMemo(() => new Map(recipes.map(r => [r.id, r])), [recipes])

  const activeRange = useMemo(
    () => activeDayRange(weekStart, plan?.startsOn ?? null, plan?.endsOn ?? null),
    [weekStart, plan?.startsOn, plan?.endsOn],
  )
  const isPartial = activeRange.firstDay > 0 || activeRange.lastDay < 6

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
    setPicker({ dayOfWeek, slot, replaceEntryId: entry.id, forMemberId: entry.forMemberId })
  }, [])

  // Default member to preselect when splitting a slot: the first adult, else anyone.
  const defaultMemberId = useMemo(() => {
    const adults = familyMembers.filter(m => m.is_full_user)
    return (adults[0] ?? familyMembers[0])?.id
  }, [familyMembers])

  const handleAddForMember = useCallback((dayOfWeek: number, slot: MealSlot) => {
    setPicker({ dayOfWeek, slot, forMemberId: defaultMemberId })
  }, [defaultMemberId])

  // Replacing a meal adds the new one BEFORE removing the old: if the add
  // fails, the slot keeps what it had (the hook has toasted) instead of
  // ending up empty. A failed add leaves the picker open for another try.
  const handlePick = async (recipeId: string, familyMemberId: string | null) => {
    if (!picker) return
    try {
      await addMeal({ dayOfWeek: picker.dayOfWeek, slot: picker.slot, recipeId, forMemberId: familyMemberId })
    } catch { return }
    if (picker.replaceEntryId) await removeMeal(picker.replaceEntryId)
    // The picker has its own useRecipes instance and can add recipes this
    // page's instance never fetched — refresh so recipesById resolves titles.
    await refreshRecipes()
    setPicker(null)
  }

  const handlePickLeftover = async (parentEntryId: string, familyMemberId: string | null) => {
    if (!picker) return
    try {
      await addMeal({ dayOfWeek: picker.dayOfWeek, slot: picker.slot, leftoverFromId: parentEntryId, forMemberId: familyMemberId })
    } catch { return }
    if (picker.replaceEntryId) await removeMeal(picker.replaceEntryId)
    setPicker(null)
  }

  // Apply an AI-invented recipe: save it to the shelf, then fill the slot —
  // the new-recipe analogue of handlePick (respects "change recipe" replace).
  const handleApplyAiNew = async (input: ManualRecipeInput) => {
    if (!picker) return
    try {
      const recipe = await addManual(input)
      await addMeal({ dayOfWeek: picker.dayOfWeek, slot: picker.slot, recipeId: recipe.id, forMemberId: picker.forMemberId })
    } catch {
      showToast("Couldn't save that recipe to the plan. Please try again.", 'error')
      return
    }
    if (picker.replaceEntryId) await removeMeal(picker.replaceEntryId)
    await refreshRecipes()
    setPicker(null)
  }

  const handleTypeName = useCallback((dayOfWeek: number, slot: MealSlot, title: string) => {
    addMeal({ dayOfWeek, slot, adHocTitle: title }).catch(() => { /* toasted in useMealPlan */ })
  }, [addMeal])

  const handleLeftoverFromLastNight = useCallback(
    (dayOfWeek: number, slot: MealSlot, sourceEntry: MealPlanEntry) => {
      addMeal({ dayOfWeek, slot, leftoverFromId: sourceEntry.id }).catch(() => { /* toasted in useMealPlan */ })
    },
    [addMeal],
  )

  const handleLeftoverTomorrow = useCallback((dayOfWeek: number, entry: MealPlanEntry) => {
    if (dayOfWeek >= activeRange.lastDay) return // no "tomorrow" inside the active range
    addMeal({ dayOfWeek: dayOfWeek + 1, slot: 'lunch', leftoverFromId: entry.id }).catch(() => { /* toasted in useMealPlan */ })
  }, [addMeal, activeRange.lastDay])

  const handleClear = useCallback((entryId: string) => {
    void removeMeal(entryId)
  }, [removeMeal])

  const handleMoveMeal = useCallback((entryId: string, targetDayOfWeek: number, targetSlot: MealSlot) => {
    void moveMeal(entryId, targetDayOfWeek, targetSlot)
  }, [moveMeal])

  const weekLabel = formatDateMonthDay(weekStart)

  return (
    <div className="px-6 md:px-10 lg:px-14 py-6 max-w-7xl mr-auto">
      {/* The shared masthead card. Meals is a WEEK, so the week nav rides the
          eyebrow the way /week and /month do, and the week itself is the
          title — the page's headline never changed, only what holds it. */}
      <MastheadCard
        variant="page"
        title={
          isPartial ? (
            <span className="italic text-primary-600">
              {formatDateMonthDay(dateForDayOfWeek(weekStart, activeRange.firstDay))}
              {' – '}
              {formatDateMonthDay(dateForDayOfWeek(weekStart, activeRange.lastDay))}
            </span>
          ) : (
            <>Week of <span className="italic text-primary-600">{weekLabel}</span></>
          )
        }
        motif="meals"
        eyebrow={
          <PeriodNavEyebrow
            label="Meals"
            onPrev={() => setWeekOffset(o => o - 1)}
            onNext={() => setWeekOffset(o => o + 1)}
            prevLabel="Previous week"
            nextLabel="Next week"
            trailing={<WeekRangePopover weekStart={weekStart} activeRange={activeRange} onChange={setWeekRange} />}
          />
        }
        subline={<MealsTabs className="-mb-1" />}
        footer={
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setPrefsOpen(true)}
            className="flex items-center gap-2 rounded-md px-3 py-2 text-[14px] text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
          >
            <SlidersHorizontal className="w-4 h-4" />
            Preferences
          </button>
          <button
            onClick={() => setGroceriesOpen(true)}
            className="btn-primary flex items-center gap-2 text-[14px]"
          >
            <ShoppingBasket className="w-4 h-4" />
            Build shopping list
          </button>
        </div>
        }
      />

      {loading && <div className="text-[12px] uppercase tracking-widest text-neutral-400">Loading…</div>}
      {error && <div className="text-accent-500">{error}</div>}

      {!loading && !error && (
        <div className="flex items-start gap-6">
          <WeekGrid
            weekStart={weekStart}
            activeRange={activeRange}
            entries={plan?.entries ?? []}
            recipesById={recipesById}
            familyMembers={familyMembers}
            onPickRecipe={handlePickRecipe}
            onTypeName={handleTypeName}
            onLeftoverFromLastNight={handleLeftoverFromLastNight}
            onChangeRecipe={handleChangeRecipe}
            onClear={handleClear}
            onLeftoverTomorrow={handleLeftoverTomorrow}
            onMoveMeal={handleMoveMeal}
            onAddForMember={handleAddForMember}
          />

          {!isMobile && (
            <div
              className="sticky top-6 w-[380px] shrink-0 border-l border-neutral-200 pl-4"
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
            // Above the dock, and quieter than its + so the two never compete.
            className="fixed right-4 z-30 w-12 h-12 rounded-full border border-neutral-200 bg-bg-elevated text-primary-600 shadow-elevated flex items-center justify-center"
            style={{ bottom: `calc(${MOBILE_TAB_BAR_HEIGHT} + env(safe-area-inset-bottom, 0px) + 12px)` }}
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
        initialFamilyMemberId={picker?.forMemberId}
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

      <MealPreferencesModal isOpen={prefsOpen} onClose={() => setPrefsOpen(false)} />
    </div>
  )
}

// Re-export shim so existing imports of PlannerPage continue to work.
export { PlanPage as PlannerPage }
