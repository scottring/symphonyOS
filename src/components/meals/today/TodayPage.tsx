import { useMemo } from 'react'
import { useMealPlan } from '@/hooks/useMealPlan'
import { useRecipes } from '@/hooks/useRecipes'
import { useMealDayLog, useWeekGramsTrend } from '@/hooks/useMealDayLog'
import { useMealTracking } from '@/hooks/useMealTracking'
import { useMobile } from '@/hooks/useMobile'
import { mondayOfWeek, isToday } from '@/lib/weekHelpers'
import { TodayHeader } from './TodayHeader'
import { HabitPills } from './HabitPills'
import { MealStateRow } from './MealStateRow'
import { AddItemRow } from './AddItemRow'
import { NotesField } from './NotesField'
import { WeightExtras } from './WeightExtras'
import { WeekTrendStrip } from './WeekTrendStrip'
import { MealsTabs } from '../MealsTabs'
import { gramsTargetFor, sumActualGrams, sumPlannedKcal } from './grams'
import type { Recipe } from '@/types/meal-planner'

/** S12 · Today — Diet Tracking. The day card in "actual" mode. Plan-first
 *  tracker: most days you ate the plan; you only mark deviations. */
export function TodayPage() {
  const today = useMemo(() => new Date(), [])
  const weekStart = useMemo(() => mondayOfWeek(today), [today])
  const dayOfWeek = (today.getDay() + 6) % 7  // Mon=0 … Sun=6

  const isMobile = useMobile()
  const { plan, loading, error, refresh, removeMeal } = useMealPlan(weekStart)
  const { recipes } = useRecipes()
  const { log, loading: logLoading, update, toggleHabit } = useMealDayLog(today)
  const tracking = useMealTracking(refresh)
  const { days: weekDays } = useWeekGramsTrend(weekStart)

  const recipesById = useMemo(() => {
    const m = new Map<string, Recipe>()
    recipes.forEach(r => m.set(r.id, r))
    return m
  }, [recipes])

  const todayEntries = useMemo(() => {
    if (!plan) return []
    return plan.entries
      .filter(e => e.dayOfWeek === dayOfWeek)
      .sort((a, b) => a.slot.localeCompare(b.slot))
  }, [plan, dayOfWeek])

  const gramsActual = sumActualGrams(todayEntries, recipesById)
  const kcalPlanned = sumPlannedKcal(todayEntries, recipesById)
  const gramsTarget = gramsTargetFor(plan?.parameter)

  // Pretty header date
  const headerDate = today.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })
  const dateKicker = today.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  }).toUpperCase()

  // Mock recent weights for the strip (would come from a weight-history hook later).
  const recentWeights = useMemo(() => weekDays.map(d => ({
    date: d.date,
    weight: undefined,  // wired later when weight-history exists
  })), [weekDays])

  const handleSwap = (entryId: string, title: string, grams: string) => {
    void tracking.swapEntry(entryId, { title, grams: grams || undefined })
  }
  const handleSkip = (entryId: string) => { void tracking.skipEntry(entryId) }
  const handleConfirm = (entryId: string) => { void tracking.confirmAsPlanned(entryId) }
  const handleUndo = handleConfirm
  const handleAdd = (title: string, grams: string) => {
    if (!plan) return
    void tracking.addAdHoc({
      mealPlanId: plan.id,
      dayOfWeek,
      slot: 'dinner',
      title,
      grams: grams || undefined,
    })
  }

  if (loading || logLoading) {
    return (
      <div className={`${isMobile ? 'px-5 py-6' : 'px-12 py-12'} max-w-3xl mx-auto`}>
        <div className="text-[12px] uppercase tracking-widest text-neutral-400">Loading…</div>
      </div>
    )
  }
  if (error) {
    return (
      <div className={`${isMobile ? 'px-5 py-6' : 'px-12 py-12'} max-w-3xl mx-auto`}>
        <div className="text-accent-500">{error}</div>
        <p className="mt-2 text-[13px] text-neutral-500">
          If this is a schema error, run migration <code>076_meal_today_tracking.sql</code>.
        </p>
      </div>
    )
  }

  // Body — same content for both variants, header changes shape.
  return (
    <div className={`${isMobile ? 'px-5 py-5' : 'px-12 py-12'} ${isMobile ? '' : 'max-w-3xl mx-auto'}`}>
      {!isMobile && <MealsTabs />}
      {/* Header */}
      <div className="mb-6">
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-neutral-500">
          {dateKicker}{isToday(today) && ' · TODAY'}
        </div>
        <h1 className={`font-display ${isMobile ? 'text-[2rem]' : 'text-[3rem]'} leading-[1.05] text-neutral-800 mt-1`}>
          {isMobile ? `${headerDate.split(', ')[0]}, ${headerDate.split(', ')[1]}` : 'Today.'}
        </h1>
        {!isMobile && (
          <p className="font-display italic text-[1.15rem] text-neutral-500 mt-2">{headerDate}</p>
        )}
      </div>

      {/* Habit pill row */}
      <div className="mb-5">
        <HabitPills habits={log?.habits ?? {}} onToggle={k => void toggleHabit(k)} />
      </div>

      {/* Header metrics */}
      <TodayHeader
        gramsActual={gramsActual}
        gramsTarget={gramsTarget}
        kcalPlanned={kcalPlanned}
        habits={log?.habits ?? {}}
        variant={isMobile ? 'mobile' : 'desktop'}
      />

      {/* Day card body */}
      <div className={`mt-6 ${isMobile ? '' : 'p-1'}`}>
        {todayEntries.length === 0 ? (
          <div className="py-6 font-display italic text-[1.05rem] text-neutral-400">
            Nothing planned for today. Tap below to log something you ate.
          </div>
        ) : (
          <div>
            {todayEntries.map(entry => (
              <MealStateRow
                key={entry.id}
                entry={entry}
                recipe={entry.recipeId ? recipesById.get(entry.recipeId) : undefined}
                onConfirmAsPlanned={handleConfirm}
                onSwap={handleSwap}
                onSkip={handleSkip}
                onUndo={handleUndo}
                onRemove={(id) => removeMeal(id)}
              />
            ))}
          </div>
        )}

        <AddItemRow onAdd={handleAdd} />
      </div>

      {/* Notes */}
      <div className="mt-6">
        <NotesField
          value={log?.notes}
          onChange={(next) => void update({ notes: next })}
        />
      </div>

      {/* Weight & extras (hidden by default) */}
      <WeightExtras
        weightLb={log?.weightLb}
        weightNote={log?.weightNote}
        recentWeights={recentWeights}
        onChange={(input) => void update(input)}
      />

      {/* Week trend strip */}
      <WeekTrendStrip days={weekDays} weekStart={weekStart} />
    </div>
  )
}
