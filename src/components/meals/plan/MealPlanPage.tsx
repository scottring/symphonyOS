import { useState, useMemo } from 'react'
import { PAGE_COLUMN } from '@/components/layout/pageLayout'
import { useNavigate } from 'react-router-dom'
import { useMealPlan } from '@/hooks/useMealPlan'
import { useRecipes } from '@/hooks/useRecipes'
import { useGroceryStatus } from '@/hooks/useGroceryStatus'
import { useWeeklyBrief } from '@/hooks/useWeeklyBrief'
import { useStandingHabits } from '@/hooks/useStandingHabits'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { sundayOfWeek, dateForDayOfWeek, isToday as isTodayHelper, formatDateMonthDay, dayLabelFor, toIsoDate } from '@/lib/weekHelpers'
import { DayCard } from './DayCard'
import { CollapseSection } from './PlanDocSections'
import { RecipePickerModal, type LeftoverCandidate } from './RecipePickerModal'
import { MealsTabs } from '../MealsTabs'
import { UndoToast } from './UndoToast'
import { DistributeLeftoversModal } from './DistributeLeftoversModal'
import { DAY_MEAL_SLOTS, MEAL_SLOT_LABEL } from '@/types/meal-planner'
import type { MealPlanEntry, MealSlot, Recipe } from '@/types/meal-planner'
import { InlineBriefComposer } from './InlineBriefComposer'
import { GroceryReviewSection } from '../groceries/GroceryReviewSection'
import { RestrictionsSection } from '../habits/RestrictionsSection'

/** Map FamilyMember color to Tailwind classes for initial chip. */
function memberColorClass(color: string): string {
  switch (color) {
    case 'blue':   return 'bg-blue-100 text-blue-700'
    case 'purple': return 'bg-purple-100 text-purple-700'
    case 'green':  return 'bg-green-100 text-green-700'
    case 'orange': return 'bg-orange-100 text-orange-700'
    case 'pink':   return 'bg-pink-100 text-pink-700'
    case 'teal':   return 'bg-teal-100 text-teal-700'
    default:       return 'bg-primary-100 text-primary-700'
  }
}

/** The week as a single Family-Meal-Plan document: day cards first,
 *  supporting sections (brief, habits, batch, groceries) collapsed below. */
export function MealPlanPage() {
  const navigate = useNavigate()
  const weekStart = useMemo(() => sundayOfWeek(new Date()), [])
  const { plan, loading, error, addMeal, removeMeal } = useMealPlan(weekStart)
  const { recipes, refresh: refreshRecipes } = useRecipes()
  const status = useGroceryStatus(plan, recipes)
  const { brief } = useWeeklyBrief(weekStart)
  const { habits, toggleWeekPause } = useStandingHabits()
  const { members: familyMembers } = useFamilyMembers()
  const [picker, setPicker] = useState<{ dayOfWeek: number; slot: MealSlot; familyMemberId?: string; replaceEntryId?: string } | null>(null)

  const recipesById = useMemo(() => {
    const map = new Map<string, Recipe>()
    recipes.forEach(r => map.set(r.id, r))
    return map
  }, [recipes])

  /** Map of `${owner_family_member_id}|${slot}` → Set of habit names, used by
   *  SlotSection to mark entries as "(habit)" derived. Only non-paused habits
   *  whose owner has a matching family_members row are included. */
  const habitsByOwnerSlot = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const h of habits) {
      if (h.paused) continue
      const owner = familyMembers.find(m => (m.auth_user_id ?? m.user_id) === h.userId)
      if (!owner) continue
      const key = `${owner.id}|${h.slot}`
      const set = map.get(key) ?? new Set<string>()
      set.add(h.name)
      map.set(key, set)
    }
    return map
  }, [habits, familyMembers])

  /** entries keyed first by dayOfWeek then by canonical slot. Each slot
   *  bucket holds an array — multiple entries support per-person variants.
   *  Legacy slots collapse into their canonical day-meal slots. */
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

  /** Sunday (dayOfWeek === 0) prep entries with a list of where their leftovers feed. */
  const sundayPrep = useMemo(() => {
    if (!plan) return []
    const prepEntries = plan.entries.filter(e => e.slot === 'prep' && e.dayOfWeek === 0)
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
  const [distributePrepId, setDistributePrepId] = useState<string | null>(null)

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
    })
  }

  /** Split a single shared row into N per-person rows (one per core/full-user member),
   *  all referencing the same recipe/title.
   *
   *  Disabled: per-person assignment was dropped from the meal write path
   *  (Task 1 of the meal-planner rebuild removed familyMemberId from
   *  AddMealInput), so there is no longer a way to distinguish the resulting
   *  rows — looping here would just insert duplicate entries. This whole page
   *  is slated for deletion in a later task; until then, split is a no-op. */
  const handleSplitSharedSlot = async (
    _dayOfWeek: number,
    _slot: MealSlot,
    _entry: MealPlanEntry,
    _members: typeof familyMembers,
  ) => {
    // no-op — see comment above
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
      <UndoToast />
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

      {/* 1. The week — day stack — anchor #plan */}
      <section id="plan" className="mt-6 scroll-mt-8">
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
                familyMembers={familyMembers}
                parameter={plan?.parameter}
                parentLabelById={parentLabelById}
                habitsByOwnerSlot={habitsByOwnerSlot}
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
      </section>

      {/* 2. Symphony's read on this week — anchor #read, visible when diffProse exists */}
      {brief?.diffProse && (
        <section id="read" className="mt-8 scroll-mt-8">
          <div className="rounded-3xl border border-neutral-200 bg-bg-elevated shadow-card p-5">
            <div className="text-[0.7rem] font-bold uppercase tracking-[0.25em] text-neutral-500 mb-2">
              SYMPHONY'S READ ON THIS WEEK
            </div>
            <p className="font-display text-[1.05rem] text-neutral-700 leading-relaxed whitespace-pre-line">
              {brief.diffProse}
            </p>
          </div>
        </section>
      )}

      {/* 3. Weekly brief — anchor #brief, COLLAPSED by default */}
      <section id="brief" className="mt-8 scroll-mt-8">
        <CollapseSection
          title="Weekly brief"
          count={brief?.body?.trim() ? 1 : 0}
          initialOpen={false}
        >
          <InlineBriefComposer weekStart={weekStart} />
        </CollapseSection>
      </section>

      {/* 4. Habits + Restrictions — anchor #habits, COLLAPSED by default */}
      <section id="habits" className="mt-8 scroll-mt-8">
        <CollapseSection
          title="Standing habits + restrictions"
          count={habits.length}
          initialOpen={false}
        >
          {habits.length === 0 ? (
            <p className="text-[13px] italic text-neutral-400">
              None configured. <button onClick={() => navigate('/meals/habits')}
                className="text-primary-500 underline italic">Configure habits →</button>
            </p>
          ) : (
            <div className="space-y-1">
              {habits.map(h => {
                const owner = familyMembers.find(m => m.auth_user_id === h.userId || (m.user_id === h.userId && !m.auth_user_id))
                const initial = owner?.name?.[0]?.toUpperCase() ?? '?'
                const colorClass = owner ? memberColorClass(owner.color) : 'bg-neutral-200 text-neutral-500'
                const weekStartIso = toIsoDate(weekStart)
                const pausedThisWeek = h.pausedForWeeks.includes(weekStartIso)
                return (
                  <div key={h.id} className={`flex items-center gap-2 text-[13px] text-neutral-700 ${(h.paused || pausedThisWeek) ? 'opacity-50 line-through' : ''}`}>
                    <span
                      className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-medium ${colorClass}`}
                      title={owner?.name ?? 'Unknown'}
                    >
                      {initial}
                    </span>
                    <span className="font-display">{h.name}</span>
                    {h.gramsHint != null && <span className="ml-1 text-primary-500 italic">+{h.gramsHint}g</span>}
                    <span className="ml-1 text-[11px] uppercase tracking-[0.12em] text-neutral-400">
                      {MEAL_SLOT_LABEL[h.slot]}
                    </span>
                    <button
                      onClick={() => toggleWeekPause(h.id, weekStartIso)}
                      title={pausedThisWeek ? 'Resume for this week' : 'Pause for this week'}
                      className="ml-auto text-[11px] italic text-neutral-400 hover:text-primary-500"
                    >
                      {pausedThisWeek ? 'resume this week' : 'pause this week'}
                    </button>
                  </div>
                )
              })}
              <div className="mt-2">
                <button onClick={() => navigate('/meals/habits')}
                        className="text-[12px] text-primary-500 italic hover:text-primary-600">
                  edit habits →
                </button>
              </div>
            </div>
          )}
          {/* Restrictions inline below habits */}
          <div className="mt-4">
            <RestrictionsSection />
          </div>
        </CollapseSection>
      </section>

      {/* 5. Distribute the batch — anchor #prep, COLLAPSED by default */}
      <section id="prep" className="mt-8 scroll-mt-8">
        <CollapseSection
          title="Distribute the batch"
          count={sundayPrep.length}
          initialOpen={false}
        >
          {sundayPrep.length === 0 ? (
            <p className="text-[13px] italic text-neutral-400">
              No batch prep this week. Tap Sunday's PREP slot to schedule one.
            </p>
          ) : (
            <div className="space-y-2">
              {sundayPrep.map(p => (
                <div key={p.id} className="flex items-start gap-2.5 group">
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
                  <button
                    onClick={() => setDistributePrepId(p.id)}
                    className="text-[12px] uppercase tracking-[0.18em] text-primary-500 hover:text-primary-600 transition-colors shrink-0 mt-0.5"
                  >
                    Distribute →
                  </button>
                </div>
              ))}
            </div>
          )}
        </CollapseSection>
      </section>

      {/* 6. Grocery review — anchor #groceries, COLLAPSED by default */}
      <section id="groceries" className="mt-8 scroll-mt-8">
        <CollapseSection
          title="Review & send to groceries"
          count={status.missingItems.length}
          initialOpen={false}
        >
          <GroceryReviewSection
            consolidated={status.consolidated}
            groceriesListId={status.groceriesListId}
            stores={status.stores}
            currentItemTexts={[]}
            recipesById={recipesById}
            onSent={() => {
              status.refresh()
            }}
          />
        </CollapseSection>
      </section>

      {/* Modals */}
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

      {distributePrepId && plan && (() => {
        const prepEntry = plan.entries.find(e => e.id === distributePrepId)
        if (!prepEntry) return null
        const prepRecipe = prepEntry.recipeId ? recipesById.get(prepEntry.recipeId) : undefined
        const prepTitle = prepRecipe?.title ?? prepEntry.adHocTitle ?? '(unnamed)'
        return (
          <DistributeLeftoversModal
            isOpen={true}
            onClose={() => setDistributePrepId(null)}
            prep={{ id: prepEntry.id, title: prepTitle, recipeId: prepEntry.recipeId, adHocTitle: prepEntry.adHocTitle }}
            allEntries={plan.entries}
            familyMembers={familyMembers}
            onAdd={async ({ dayOfWeek, slot }) => {
              await addMeal({
                dayOfWeek,
                slot,
                recipeId: prepEntry.recipeId,
                adHocTitle: prepEntry.recipeId ? undefined : prepEntry.adHocTitle,
                leftoverFromId: prepEntry.id,
              })
            }}
            onRemove={async (entryId) => {
              await removeMeal(entryId)
            }}
          />
        )
      })()}
    </div>
  )
}

// Re-export shim so existing imports of PlannerPage continue to work.
export { MealPlanPage as PlannerPage }

/** Map any legacy or canonical slot to a canonical day-meal slot. */
function canonicalSlot(slot: string): MealSlot | undefined {
  if (DAY_MEAL_SLOTS.includes(slot as MealSlot)) return slot as MealSlot
  if (slot === 'prep') return 'prep'
  if (slot === 'lunch_iris' || slot === 'lunch_scott') return 'lunch'
  if (slot === 'kid_alternate') return 'dinner'
  return undefined
}
