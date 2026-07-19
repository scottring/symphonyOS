import { useMemo } from 'react'
import { dayLabelFor, dateForDayOfWeek, isToday as isTodayHelper, formatDateMonthDay, type ActiveDayRange } from '@/lib/weekHelpers'
import { resolveMealTitle } from '@/lib/mealTitle'
import { SlotCell } from './SlotCell'
import { DAY_MEAL_SLOTS } from '@/types/meal-planner'
import { adjacentCell } from '@/lib/mealGridOrder'
import type { MealPlanEntry, MealSlot, Recipe } from '@/types/meal-planner'

export interface WeekGridProps {
  /** The Sunday that starts this week (matches `meal_plans.week_start`). */
  weekStart: Date
  /** Day-of-week bounds of the plan's active range (0=Sun..6=Sat). Days
   *  outside render nothing; their entries stay in the DB untouched. */
  activeRange: ActiveDayRange
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
function skippedLabel(from: number, to: number): string {
  return from === to ? dayLabelFor(from) : `${dayLabelFor(from)} – ${dayLabelFor(to)}`
}

export function WeekGrid({
  weekStart, activeRange, entries, recipesById,
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

  const days = useMemo(
    () => Array.from(
      { length: activeRange.lastDay - activeRange.firstDay + 1 },
      (_, i) => activeRange.firstDay + i,
    ),
    [activeRange.firstDay, activeRange.lastDay],
  )

  return (
    <div className="flex-1 min-w-0 space-y-3">
      {activeRange.firstDay > 0 && (
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-neutral-400 px-1">
          {skippedLabel(0, activeRange.firstDay - 1)} · not planned
        </div>
      )}
      {days.map(d => {
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
                // Clamp adjacency to the active range — moving a meal onto a
                // hidden day would make it vanish from the grid.
                const inRange = (cell: { dayOfWeek: number; slot: MealSlot } | null) =>
                  cell && cell.dayOfWeek >= activeRange.firstDay && cell.dayOfWeek <= activeRange.lastDay ? cell : null
                const up = inRange(adjacentCell(d, slot, 'up'))
                const down = inRange(adjacentCell(d, slot, 'down'))

                return (
                  <SlotCell
                    key={slot}
                    dayOfWeek={d}
                    slot={slot}
                    entry={entry}
                    title={entry ? resolveMealTitle(entry, entriesById, recipesById) : undefined}
                    canLeftoverTomorrow={slot === 'dinner' && d < activeRange.lastDay}
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
      {activeRange.lastDay < 6 && (
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-neutral-400 px-1">
          {skippedLabel(activeRange.lastDay + 1, 6)} · not planned
        </div>
      )}
    </div>
  )
}
