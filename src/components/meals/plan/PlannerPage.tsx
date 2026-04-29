import { useState, useMemo } from 'react'
import { useMealPlan } from '@/hooks/useMealPlan'
import { useRecipes } from '@/hooks/useRecipes'
import { useGroceryStatus } from '@/hooks/useGroceryStatus'
import { mondayOfWeek, dateForDayOfWeek, isToday as isTodayHelper } from '@/lib/weekHelpers'
import { PlannerHeader } from './PlannerHeader'
import { DayStanza } from './DayStanza'
import { EmptyDayStanza } from './EmptyDayStanza'
import { RecipePickerModal } from './RecipePickerModal'
import { GroceryStatusCard } from '../groceries/GroceryStatusCard'
import { SendToGroceriesModal } from '../groceries/SendToGroceriesModal'
import type { Recipe } from '@/types/meal-planner'

export function PlannerPage() {
  const weekStart = useMemo(() => mondayOfWeek(new Date()), [])
  const { plan, loading, error, addMeal, removeMeal, setParameter } = useMealPlan(weekStart)
  const { recipes } = useRecipes()
  const status = useGroceryStatus(plan, recipes)
  const [pickerOpen, setPickerOpen] = useState<{ dayOfWeek: number; replaceEntryId?: string } | null>(null)
  const [sendOpen, setSendOpen] = useState(false)

  const recipesById = useMemo(() => {
    const map = new Map<string, Recipe>()
    recipes.forEach(r => map.set(r.id, r))
    return map
  }, [recipes])

  const dinnerByDay = useMemo(() => {
    const m = new Map<number, NonNullable<typeof plan>['entries'][number]>()
    plan?.entries.forEach(e => {
      if (e.slot === 'dinner') m.set(e.dayOfWeek, e)
    })
    return m
  }, [plan])

  const handlePick = async (recipeId: string) => {
    if (!pickerOpen) return
    if (pickerOpen.replaceEntryId) {
      await removeMeal(pickerOpen.replaceEntryId)
    }
    await addMeal({ dayOfWeek: pickerOpen.dayOfWeek, slot: 'dinner', recipeId })
    setPickerOpen(null)
  }

  if (loading) {
    return (
      <div className="px-12 py-12 max-w-3xl mx-auto">
        <div className="text-[12px] uppercase tracking-widest text-neutral-400">Loading…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="px-12 py-12 max-w-3xl mx-auto">
        <div className="text-accent-500">{error}</div>
      </div>
    )
  }

  return (
    <div className="px-12 py-12 max-w-3xl mx-auto">
      <PlannerHeader
        weekStart={weekStart}
        parameter={plan?.parameter}
        onParameterChange={setParameter}
      />

      <GroceryStatusCard
        stockedPercent={status.stockedPercent}
        missingCount={status.missingItems.length}
        totalCount={status.consolidated.length}
        onSendToGroceries={() => setSendOpen(true)}
      />

      <div>
        {[0, 1, 2, 3, 4, 5, 6].map(d => {
          const date = dateForDayOfWeek(weekStart, d)
          const today = isTodayHelper(date)
          const entry = dinnerByDay.get(d)
          if (entry) {
            return (
              <DayStanza
                key={d}
                dayOfWeek={d}
                date={date}
                isToday={today}
                entry={entry}
                recipe={entry.recipeId ? recipesById.get(entry.recipeId) : undefined}
                onReplace={(id) => setPickerOpen({ dayOfWeek: d, replaceEntryId: id })}
                onRemove={(id) => removeMeal(id)}
              />
            )
          }
          return (
            <EmptyDayStanza
              key={d}
              dayOfWeek={d}
              date={date}
              isToday={today}
              onPickRecipe={() => setPickerOpen({ dayOfWeek: d })}
            />
          )
        })}
      </div>

      <RecipePickerModal
        isOpen={pickerOpen !== null}
        onClose={() => setPickerOpen(null)}
        onPick={handlePick}
      />

      <SendToGroceriesModal
        isOpen={sendOpen}
        onClose={() => setSendOpen(false)}
        consolidated={status.consolidated}
        groceriesListId={status.groceriesListId}
        currentItemTexts={[]}
        onSent={() => status.refresh()}
      />
    </div>
  )
}
