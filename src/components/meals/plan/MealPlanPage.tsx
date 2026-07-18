import { useState, useMemo } from 'react'
import { PAGE_COLUMN } from '@/components/layout/pageLayout'
import { useMealPlan } from '@/hooks/useMealPlan'
import { useRecipes } from '@/hooks/useRecipes'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { sundayOfWeek, dateForDayOfWeek, isToday as isTodayHelper, formatDateMonthDay, dayLabelFor } from '@/lib/weekHelpers'
import { DayCard } from './DayCard'
import { RecipePickerModal, type LeftoverCandidate } from './RecipePickerModal'
import { MealsTabs } from '../MealsTabs'
import { DAY_MEAL_SLOTS } from '@/types/meal-planner'
import type { MealPlanEntry, MealSlot, Recipe } from '@/types/meal-planner'

/** The week as a stack of day cards. This page is a compiling placeholder —
 *  it is fully replaced in Phase 2 of the meal-planner rebuild. */
export function MealPlanPage() {
  const weekStart = useMemo(() => sundayOfWeek(new Date()), [])
  const { plan, loading, error, addMeal, removeMeal } = useMealPlan(weekStart)
  const { recipes, refresh: refreshRecipes } = useRecipes()
  const { members: familyMembers } = useFamilyMembers()
  const [picker, setPicker] = useState<{ dayOfWeek: number; slot: MealSlot; replaceEntryId?: string } | null>(null)

  const recipesById = useMemo(() => {
    const map = new Map<string, Recipe>()
    recipes.forEach(r => map.set(r.id, r))
    return map
  }, [recipes])

  /** entries keyed first by dayOfWeek then by canonical slot. Legacy/unknown
   *  slot values (e.g. from before the 3-slot core model) are dropped. */
  const entriesByDayBySlot = useMemo(() => {
    const m = new Map<number, Map<MealSlot, MealPlanEntry[]>>()
    plan?.entries.forEach(e => {
      const canonical = canonicalSlot(e.slot)
      if (!canonical) return
      const dayMap = m.get(e.dayOfWeek) ?? new Map<MealSlot, MealPlanEntry[]>()
      const slotArr = dayMap.get(canonical) ?? []
      slotArr.push(e)
      dayMap.set(canonical, slotArr)
      m.set(e.dayOfWeek, dayMap)
    })
    return m
  }, [plan])

  const handlePick = async (recipeId: string, _familyMemberId: string | null) => {
    if (!picker) return
    if (picker.replaceEntryId) {
      await removeMeal(picker.replaceEntryId)
    }
    await addMeal({
      dayOfWeek: picker.dayOfWeek,
      slot: picker.slot,
      recipeId,
    })
    // The picker has its own useRecipes instance and can add recipes that the
    // page's instance never fetched. Refresh so recipesById can resolve the
    // chosen recipe's title instead of falling back to "(unnamed)".
    await refreshRecipes()
    setPicker(null)
  }

  /** Leftover candidates: any recipe-backed entry whose recipe is_prep_friendly.
   *  Surfaced as a tab in the picker. */
  const leftoverCandidates = useMemo<LeftoverCandidate[]>(() => {
    if (!plan) return []
    const out: LeftoverCandidate[] = []
    for (const e of plan.entries) {
      // Don't list leftover entries themselves as candidates.
      if (e.leftoverFrom) continue
      const recipe = e.recipeId ? recipesById.get(e.recipeId) : undefined
      if (recipe?.isPrepFriendly !== true) continue
      out.push({ entry: e, recipe, dayLabel: `${dayLabelFor(e.dayOfWeek)} ${e.slot}` })
    }
    return out
  }, [plan, recipesById])

  /** Map entry.id → "from X" label, for leftover entries that reference a parent. */
  const parentLabelById = useMemo(() => {
    const map = new Map<string, string>()
    if (!plan) return map
    const byId = new Map(plan.entries.map(e => [e.id, e]))
    for (const e of plan.entries) {
      if (!e.leftoverFrom) continue
      const parent = byId.get(e.leftoverFrom)
      if (!parent) continue
      map.set(e.id, `${dayLabelFor(parent.dayOfWeek)} ${parent.slot}`)
    }
    return map
  }, [plan])

  const handlePickLeftover = async (parentEntryId: string, _familyMemberId: string | null) => {
    if (!picker) return
    const parent = plan?.entries.find(e => e.id === parentEntryId)
    if (!parent) return
    if (picker.replaceEntryId) await removeMeal(picker.replaceEntryId)
    await addMeal({
      dayOfWeek: picker.dayOfWeek,
      slot: picker.slot,
      recipeId: parent.recipeId,
      adHocTitle: parent.recipeId ? undefined : parent.adHocTitle,
      leftoverFromId: parentEntryId,
    })
    setPicker(null)
  }

  /** Collapse a slot with multiple entries that all reference the same
   *  recipe or ad-hoc title into a single row. */
  const handleConsolidateSlot = async (
    dayOfWeek: number,
    slot: MealSlot,
    entries: MealPlanEntry[],
    shared: { recipeId?: string; adHocTitle?: string },
  ) => {
    for (const e of entries) {
      await removeMeal(e.id)
    }
    await addMeal({
      dayOfWeek,
      slot,
      recipeId: shared.recipeId,
      adHocTitle: shared.adHocTitle,
    })
  }

  if (loading) {
    return (
      <div className={PAGE_COLUMN}>
        <MealsTabs />
        <div className="text-[12px] uppercase tracking-widest text-neutral-400">Loading…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={PAGE_COLUMN}>
        <MealsTabs />
        <div className="text-accent-500">{error}</div>
      </div>
    )
  }

  // Build week-of label.
  const weekLabel = formatDateMonthDay(weekStart)

  return (
    <div className={PAGE_COLUMN}>
      <MealsTabs />

      {/* Doc title + kicker */}
      <div className="mb-2">
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-neutral-500 mb-2">
          WEEK OF {weekLabel.toUpperCase()}
        </div>
        <h1 className="font-display text-[3rem] leading-[1.05] text-neutral-800">
          Family Meal <span className="italic text-primary-500">Plan.</span>
        </h1>
      </div>

      {/* The week — day stack */}
      <section className="mt-6">
        <div className="mt-2">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-neutral-500 mb-3">
            THE WEEK
          </div>
          {[0, 1, 2, 3, 4, 5, 6].map(d => {
            const date = dateForDayOfWeek(weekStart, d)
            const today = isTodayHelper(date)
            const slotMap = entriesByDayBySlot.get(d) ?? new Map<MealSlot, MealPlanEntry[]>()
            return (
              <DayCard
                key={d}
                dayOfWeek={d}
                date={date}
                isToday={today}
                entriesBySlot={slotMap}
                recipesById={recipesById}
                parentLabelById={parentLabelById}
                onPickForSlot={(slot) => setPicker({ dayOfWeek: d, slot })}
                onReplace={(entryId) => {
                  const entry = plan?.entries.find(e => e.id === entryId)
                  if (!entry) return
                  setPicker({
                    dayOfWeek: d,
                    slot: canonicalSlot(entry.slot) ?? 'dinner',
                    replaceEntryId: entryId,
                  })
                }}
                onRemove={(entryId) => removeMeal(entryId)}
                onConsolidateSlot={handleConsolidateSlot}
              />
            )
          })}
        </div>
      </section>

      {/* Modals */}
      <RecipePickerModal
        isOpen={picker !== null}
        slot={picker?.slot}
        familyMembers={familyMembers}
        leftoverCandidates={leftoverCandidates}
        onClose={() => setPicker(null)}
        onPick={handlePick}
        onPickLeftover={handlePickLeftover}
      />
    </div>
  )
}

// Re-export shim so existing imports of PlannerPage continue to work.
export { MealPlanPage as PlannerPage }

/** Map a slot value to a canonical day-meal slot. Values outside the 3-slot
 *  core model (legacy per-person / prep variants) are dropped. */
function canonicalSlot(slot: string): MealSlot | undefined {
  return DAY_MEAL_SLOTS.includes(slot as MealSlot) ? (slot as MealSlot) : undefined
}
