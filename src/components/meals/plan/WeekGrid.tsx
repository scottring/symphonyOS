import { useMemo } from 'react'
import { dayLabelFor, dateForDayOfWeek, isToday as isTodayHelper, formatDateMonthDay } from '@/lib/weekHelpers'
import { resolveMealTitle } from '@/lib/mealTitle'
import { SlotCell } from './SlotCell'
import { DAY_MEAL_SLOTS } from '@/types/meal-planner'
import { adjacentCell } from '@/lib/mealGridOrder'
import type { MealPlanEntry, MealSlot, Recipe } from '@/types/meal-planner'

export interface WeekGridProps {
  /** The Sunday that starts this week (matches `meal_plans.week_start`). */
  weekStart: Date
  entries: MealPlanEntry[]
  recipesById: Map<string, Recipe>
  onPickRecipe: (dayOfWeek: number, slot: MealSlot) => void
  onTypeName: (dayOfWeek: number, slot: MealSlot, title: string) => void
  onLeftoverFromLastNight: (dayOfWeek: number, slot: MealSlot, sourceEntry: MealPlanEntry) => void
  onChangeRecipe: (dayOfWeek: number, slot: MealSlot, entry: MealPlanEntry) => void
  onClear: (entryId: string) => void
  onLeftoverTomorrow: (dayOfWeek: number, entry: MealPlanEntry) => void
  /** Move an entry to a target cell (day + slot); PlanPage handles swap-on-collision. */
  onMoveMeal: (entryId: string, targetDayOfWeek: number, targetSlot: MealSlot) => void
}

/** The week as a 7-day x 3-slot grid. Pure presentational — all writes
 *  bubble up to PlanPage, which owns useMealPlan. Realtime updates flow
 *  down as new `entries` props; day_of_week is 0=Sunday..6=Saturday so the
 *  grid renders in DB order with no remapping. */
export function WeekGrid({
  weekStart, entries, recipesById,
  onPickRecipe, onTypeName, onLeftoverFromLastNight,
  onChangeRecipe, onClear, onLeftoverTomorrow, onMoveMeal,
}: WeekGridProps) {
  const entriesById = useMemo(() => new Map(entries.map(e => [e.id, e])), [entries])

  const entriesByDayBySlot = useMemo(() => {
    const m = new Map<number, Map<MealSlot, MealPlanEntry>>()
    for (const e of entries) {
      const dayMap = m.get(e.dayOfWeek) ?? new Map<MealSlot, MealPlanEntry>()
      dayMap.set(e.slot, e)
      m.set(e.dayOfWeek, dayMap)
    }
    return m
  }, [entries])

  return (
    <div className="flex-1 min-w-0 space-y-3">
      {[0, 1, 2, 3, 4, 5, 6].map(d => {
        const date = dateForDayOfWeek(weekStart, d)
        const today = isTodayHelper(date)
        const slotMap = entriesByDayBySlot.get(d)
        const prevDinner = d > 0 ? entriesByDayBySlot.get(d - 1)?.get('dinner') : undefined

        return (
          <div
            key={d}
            data-day={d}
            className={`card px-5 py-4 ${today ? 'ring-1 ring-primary-300' : ''}`}
          >
            <div className={`text-[10px] font-bold uppercase tracking-[0.22em] mb-2 ${today ? 'text-primary-600' : 'text-neutral-400'}`}>
              {dayLabelFor(d)} · {formatDateMonthDay(date).toUpperCase()}{today && ' · TODAY'}
            </div>
            <div>
              {DAY_MEAL_SLOTS.map(slot => {
                const entry = slotMap?.get(slot)
                const up = adjacentCell(d, slot, 'up')
                const down = adjacentCell(d, slot, 'down')

                return (
                  <SlotCell
                    key={slot}
                    dayOfWeek={d}
                    slot={slot}
                    entry={entry}
                    title={entry ? resolveMealTitle(entry, entriesById, recipesById) : undefined}
                    canLeftoverTomorrow={slot === 'dinner' && d < 6}
                    canLeftoverFromLastNight={!entry && prevDinner != null}
                    previousDinnerTitle={prevDinner ? resolveMealTitle(prevDinner, entriesById, recipesById) : undefined}
                    canMoveUp={up != null}
                    canMoveDown={down != null}
                    onChangeRecipe={() => entry && onChangeRecipe(d, slot, entry)}
                    onClear={() => entry && onClear(entry.id)}
                    onLeftoverTomorrow={() => entry && onLeftoverTomorrow(d, entry)}
                    onPickRecipe={() => onPickRecipe(d, slot)}
                    onTypeName={(t) => onTypeName(d, slot, t)}
                    onLeftoverFromLastNight={() => prevDinner && onLeftoverFromLastNight(d, slot, prevDinner)}
                    onMoveUp={() => { if (entry && up) onMoveMeal(entry.id, up.dayOfWeek, up.slot) }}
                    onMoveDown={() => { if (entry && down) onMoveMeal(entry.id, down.dayOfWeek, down.slot) }}
                  />
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
