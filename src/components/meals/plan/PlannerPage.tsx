import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMealPlan } from '@/hooks/useMealPlan'
import { useRecipes } from '@/hooks/useRecipes'
import { useGroceryStatus } from '@/hooks/useGroceryStatus'
import { useWeeklyBrief } from '@/hooks/useWeeklyBrief'
import { useStandingHabits } from '@/hooks/useStandingHabits'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { mondayOfWeek, dateForDayOfWeek, isToday as isTodayHelper, formatDateMonthDay, dayLabelFor } from '@/lib/weekHelpers'
import { DayCard } from './DayCard'
import { CollapseSection } from './PlanDocSections'
import { RecipePickerModal, type LeftoverCandidate } from './RecipePickerModal'
import { GroceryStatusCard } from '../groceries/GroceryStatusCard'
import { SendToGroceriesModal } from '../groceries/SendToGroceriesModal'
import { MealsTabs } from '../MealsTabs'
import { ParameterDropdown } from './ParameterDropdown'
import { AskSymphonyRail } from '../chat/AskSymphonyRail'
import { UndoToast } from './UndoToast'
import { DAY_MEAL_SLOTS, MEAL_SLOT_LABEL } from '@/types/meal-planner'
import type { MealPlanEntry, MealSlot, Recipe } from '@/types/meal-planner'

/** Surface 3 — Full Plan View (the document). The week as a single
 *  Family-Meal-Plan document with collapsible sections and day cards. */
export function PlannerPage() {
  const navigate = useNavigate()
  const weekStart = useMemo(() => mondayOfWeek(new Date()), [])
  const { plan, loading, error, addMeal, removeMeal, setParameter } = useMealPlan(weekStart)
  const { recipes } = useRecipes()
  const status = useGroceryStatus(plan, recipes)
  const { brief } = useWeeklyBrief(weekStart)
  const { habits } = useStandingHabits()
  const { members: familyMembers } = useFamilyMembers()
  const [picker, setPicker] = useState<{ dayOfWeek: number; slot: MealSlot; familyMemberId?: string; replaceEntryId?: string } | null>(null)
  const [sendOpen, setSendOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)

  const recipesById = useMemo(() => {
    const map = new Map<string, Recipe>()
    recipes.forEach(r => map.set(r.id, r))
    return map
  }, [recipes])

  /** entries keyed first by dayOfWeek then by canonical slot. Each slot
   *  bucket holds an array — multiple entries support per-person variants
   *  (Iris / Scott / Kids). Legacy slots collapse: lunch_iris/lunch_scott →
   *  lunch (preserving the family_member_id), kid_alternate → dinner. */
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

  const handlePick = async (recipeId: string, familyMemberId: string | null) => {
    if (!picker) return
    if (picker.replaceEntryId) {
      await removeMeal(picker.replaceEntryId)
    }
    await addMeal({
      dayOfWeek: picker.dayOfWeek,
      slot: picker.slot,
      recipeId,
      familyMemberId,
    })
    setPicker(null)
  }

  /** Leftover candidates: any prep entry, or any recipe-backed entry whose
   *  recipe is_prep_friendly. Surfaced as a tab in the picker. */
  const leftoverCandidates = useMemo<LeftoverCandidate[]>(() => {
    if (!plan) return []
    const out: LeftoverCandidate[] = []
    for (const e of plan.entries) {
      // Don't list leftover entries themselves as candidates.
      if (e.leftoverFrom) continue
      const recipe = e.recipeId ? recipesById.get(e.recipeId) : undefined
      const isCandidate = e.slot === 'prep' || (recipe?.isPrepFriendly === true)
      if (!isCandidate) continue
      const dayLabel = e.slot === 'prep'
        ? `${dayLabelFor(e.dayOfWeek)} batch`
        : `${dayLabelFor(e.dayOfWeek)} ${e.slot}`
      out.push({ entry: e, recipe, dayLabel })
    }
    return out
  }, [plan, recipesById])

  /** Recipes that appear on 2+ days in the current plan, sorted by frequency. */
  const ingredientThreads = useMemo(() => {
    if (!plan) return []
    const byRecipe = new Map<string, MealPlanEntry[]>()
    for (const e of plan.entries) {
      if (!e.recipeId) continue
      const arr = byRecipe.get(e.recipeId) ?? []
      arr.push(e)
      byRecipe.set(e.recipeId, arr)
    }
    const out: Array<{ recipeId: string; title: string; usedAt: string; count: number }> = []
    for (const [recipeId, entries] of byRecipe) {
      if (entries.length < 2) continue
      const recipe = recipesById.get(recipeId)
      if (!recipe) continue
      const usedAt = entries
        .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
        .map(e => `${dayLabelFor(e.dayOfWeek)} ${MEAL_SLOT_LABEL[e.slot] ?? e.slot}`)
        .join(' · ')
      out.push({ recipeId, title: recipe.title, usedAt, count: entries.length })
    }
    out.sort((a, b) => b.count - a.count)
    return out
  }, [plan, recipesById])

  /** Sunday (dayOfWeek === 6) prep entries with a list of where their leftovers feed. */
  const sundayPrep = useMemo(() => {
    if (!plan) return []
    const prepEntries = plan.entries.filter(e => e.slot === 'prep' && e.dayOfWeek === 6)
    return prepEntries.map(prep => {
      const title = (prep.recipeId ? recipesById.get(prep.recipeId)?.title : null) ?? prep.adHocTitle ?? '(unnamed)'
      const feeds = plan.entries
        .filter(child => child.leftoverFrom === prep.id)
        .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
        .map(child => `${dayLabelFor(child.dayOfWeek)} ${child.slot}`)
      return { id: prep.id, title, feeds }
    })
  }, [plan, recipesById])

  const [prepDone, setPrepDone] = useState<Record<string, boolean>>({})

  /** Map entry.id → "from X" label, for leftover entries that reference a parent. */
  const parentLabelById = useMemo(() => {
    const map = new Map<string, string>()
    if (!plan) return map
    const byId = new Map(plan.entries.map(e => [e.id, e]))
    for (const e of plan.entries) {
      if (!e.leftoverFrom) continue
      const parent = byId.get(e.leftoverFrom)
      if (!parent) continue
      const label = parent.slot === 'prep'
        ? `${dayLabelFor(parent.dayOfWeek)} batch`
        : `${dayLabelFor(parent.dayOfWeek)} ${parent.slot}`
      map.set(e.id, label)
    }
    return map
  }, [plan])

  const handlePickLeftover = async (parentEntryId: string, familyMemberId: string | null) => {
    if (!picker) return
    const parent = plan?.entries.find(e => e.id === parentEntryId)
    if (!parent) return
    if (picker.replaceEntryId) await removeMeal(picker.replaceEntryId)
    await addMeal({
      dayOfWeek: picker.dayOfWeek,
      slot: picker.slot,
      recipeId: parent.recipeId,
      adHocTitle: parent.recipeId ? undefined : parent.adHocTitle,
      familyMemberId,
      leftoverFromId: parentEntryId,
    })
    setPicker(null)
  }

  /** Collapse a split slot (multiple per-person entries that all reference
   *  the same recipe or ad-hoc title) into a single family-default row. */
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
      familyMemberId: null,
    })
  }

  /** Split a single shared row into N per-person rows (one per core/full-user member),
   *  all referencing the same recipe/title. */
  const handleSplitSharedSlot = async (
    dayOfWeek: number,
    slot: MealSlot,
    entry: MealPlanEntry,
    members: typeof familyMembers,
  ) => {
    // Delete the shared entry
    await removeMeal(entry.id)
    // Add one personal entry per "core or full-user" member with the same recipe/title
    for (const m of members.filter(x => x.is_full_user || x.member_type === 'core')) {
      await addMeal({
        dayOfWeek,
        slot,
        recipeId: entry.recipeId,
        adHocTitle: entry.adHocTitle,
        familyMemberId: m.id,
      })
    }
  }

  if (loading) {
    return (
      <div className="px-12 py-12 max-w-3xl mx-auto">
        <MealsTabs />
        <div className="text-[12px] uppercase tracking-widest text-neutral-400">Loading…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="px-12 py-12 max-w-3xl mx-auto">
        <MealsTabs />
        <div className="text-accent-500">{error}</div>
      </div>
    )
  }

  // Build week-of label + subtitle. Prefer the brief body if present.
  const weekLabel = formatDateMonthDay(weekStart)
  const briefLine = brief?.body?.trim()
    ? brief.body.trim().split('\n')[0]
    : (plan?.parameter ? `Monday–Sunday · ${plan.parameter}` : 'Monday–Sunday')

  return (
    <div className="px-12 py-12 max-w-3xl mx-auto">
      <UndoToast />
      <MealsTabs />

      {/* Doc title + kicker */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-neutral-500 mb-2">
            WEEK OF {weekLabel.toUpperCase()}
          </div>
          <h1 className="font-display text-[3rem] leading-[1.05] text-neutral-800">
            Family Meal <span className="italic text-primary-500">Plan.</span>
          </h1>
          <p className="font-display italic text-[1.1rem] text-neutral-500 mt-2">
            {briefLine}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ParameterDropdown value={plan?.parameter} onChange={setParameter} />
          <button onClick={() => setChatOpen(true)}
                  className="px-3 py-1.5 rounded-full text-[12px] font-medium bg-primary-500 text-white shadow-primary hover:bg-primary-600 flex items-center gap-1.5">
            <span>✦</span> Ask Symphony
          </button>
        </div>
      </div>

      <div className="mt-6 mb-8">
        <GroceryStatusCard
          stockedPercent={status.stockedPercent}
          missingCount={status.missingItems.length}
          totalCount={status.consolidated.length}
          onSendToGroceries={() => setSendOpen(true)}
        />
      </div>

      {/* Doc sections */}
      <CollapseSection title="Standing habits" count={habits.length} initialOpen={habits.length > 0}>
        {habits.length === 0 ? (
          <p className="text-[13px] italic text-neutral-400">
            None configured. <button onClick={() => navigate('/meals/habits')}
              className="text-primary-500 underline italic">Configure habits →</button>
          </p>
        ) : (
          <div className="space-y-1">
            {habits.map(h => (
              <div key={h.id} className={`text-[13px] text-neutral-700 ${h.paused ? 'opacity-50 line-through' : ''}`}>
                <span className="font-display">{h.name}</span>
                {h.gramsHint != null && <span className="ml-1.5 text-primary-500 italic">+{h.gramsHint}g</span>}
                <span className="ml-2 text-[11px] uppercase tracking-[0.12em] text-neutral-400">
                  {MEAL_SLOT_LABEL[h.slot]}
                </span>
              </div>
            ))}
            <div className="mt-2">
              <button onClick={() => navigate('/meals/habits')}
                      className="text-[12px] text-primary-500 italic hover:text-primary-600">
                edit habits →
              </button>
            </div>
          </div>
        )}
      </CollapseSection>

      <CollapseSection title="What's different this week" initialOpen={!!brief?.body}>
        {brief?.body?.trim() ? (
          <div>
            <p className="font-display text-[1.05rem] text-neutral-700 whitespace-pre-line">
              {brief.body}
            </p>
            <button onClick={() => navigate('/meals/brief')}
                    className="mt-3 text-[12px] text-primary-500 italic hover:text-primary-600">
              edit brief →
            </button>
          </div>
        ) : (
          <p className="text-[13px] italic text-neutral-400">
            No brief yet. <button onClick={() => navigate('/meals/brief')}
              className="text-primary-500 underline italic">Compose one →</button>
          </p>
        )}
      </CollapseSection>

      <CollapseSection title="Ingredient threads" initialOpen={ingredientThreads.length > 0}>
        {ingredientThreads.length === 0 ? (
          <p className="text-[13px] italic text-neutral-400">
            Nothing repeats this week.
          </p>
        ) : (
          <div className="space-y-2">
            {ingredientThreads.map(thread => (
              <div key={thread.recipeId} className="grid grid-cols-[1fr_2fr] gap-3 text-[13px]">
                <div className="font-display text-neutral-800">{thread.title}</div>
                <div className="font-display italic text-neutral-500">{thread.usedAt}</div>
              </div>
            ))}
          </div>
        )}
      </CollapseSection>

      <CollapseSection title="Sunday batch-cook" count={sundayPrep.length} initialOpen={sundayPrep.length > 0}>
        {sundayPrep.length === 0 ? (
          <p className="text-[13px] italic text-neutral-400">
            No batch prep this week. Tap Sunday's PREP slot to schedule one.
          </p>
        ) : (
          <div className="space-y-2">
            {sundayPrep.map(p => (
              <label key={p.id} className="flex items-start gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={!!prepDone[p.id]}
                  onChange={e => setPrepDone(prev => ({ ...prev, [p.id]: e.target.checked }))}
                  className="mt-1 accent-primary-500"
                />
                <div className="flex-1">
                  <div className={`font-display text-[14px] text-neutral-800 ${prepDone[p.id] ? 'line-through opacity-50' : ''}`}>
                    {p.title}
                  </div>
                  {p.feeds.length > 0 && (
                    <div className="font-display italic text-[12px] text-neutral-400 mt-0.5">
                      feeds {p.feeds.join(' · ')}
                    </div>
                  )}
                </div>
              </label>
            ))}
          </div>
        )}
      </CollapseSection>

      {/* Day stack */}
      <div className="mt-8">
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
              familyMembers={familyMembers}
              parameter={plan?.parameter}
              parentLabelById={parentLabelById}
              onPickForSlot={(slot, familyMemberId) =>
                setPicker({ dayOfWeek: d, slot, familyMemberId })
              }
              onReplace={(entryId) => {
                const entry = plan?.entries.find(e => e.id === entryId)
                if (!entry) return
                setPicker({
                  dayOfWeek: d,
                  slot: canonicalSlot(entry.slot) ?? 'dinner',
                  familyMemberId: entry.familyMemberId,
                  replaceEntryId: entryId,
                })
              }}
              onRemove={(entryId) => removeMeal(entryId)}
              onConsolidateSlot={handleConsolidateSlot}
              onSplitSharedSlot={(slot, entry) => handleSplitSharedSlot(d, slot, entry, familyMembers)}
            />
          )
        })}
      </div>

      <RecipePickerModal
        isOpen={picker !== null}
        slot={picker?.slot}
        initialFamilyMemberId={picker?.familyMemberId}
        familyMembers={familyMembers}
        leftoverCandidates={leftoverCandidates}
        onClose={() => setPicker(null)}
        onPick={handlePick}
        onPickLeftover={handlePickLeftover}
      />

      <SendToGroceriesModal
        isOpen={sendOpen}
        onClose={() => setSendOpen(false)}
        consolidated={status.consolidated}
        groceriesListId={status.groceriesListId}
        currentItemTexts={[]}
        onSent={() => status.refresh()}
      />

      <AskSymphonyRail
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
      />
    </div>
  )
}

/** Map any legacy or canonical slot to a canonical day-meal slot. */
function canonicalSlot(slot: string): MealSlot | undefined {
  if (DAY_MEAL_SLOTS.includes(slot as MealSlot)) return slot as MealSlot
  if (slot === 'lunch_iris' || slot === 'lunch_scott') return 'lunch'
  if (slot === 'kid_alternate') return 'dinner'
  return undefined
}
