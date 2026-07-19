import { DAY_MEAL_SLOTS, type MealSlot } from '@/types/meal-planner'

/** The week grid renders as one vertical column of 21 cells, day-major then
 *  slot-minor: Sun breakfast, Sun lunch, Sun dinner, Mon breakfast, …, Sat
 *  dinner. A cell's position in that column is `dayOfWeek*3 + slotIndex`. */
export const CELLS_PER_WEEK = 7 * DAY_MEAL_SLOTS.length

export function cellIndex(dayOfWeek: number, slot: MealSlot): number {
  return dayOfWeek * DAY_MEAL_SLOTS.length + DAY_MEAL_SLOTS.indexOf(slot)
}

export function cellFromIndex(index: number): { dayOfWeek: number; slot: MealSlot } {
  return {
    dayOfWeek: Math.floor(index / DAY_MEAL_SLOTS.length),
    slot: DAY_MEAL_SLOTS[index % DAY_MEAL_SLOTS.length],
  }
}

/** The cell immediately above ('up') or below ('down') the given one in the
 *  stacked column, crossing day boundaries. Returns null at the ends (no cell
 *  above Sun breakfast, none below Sat dinner). */
export function adjacentCell(
  dayOfWeek: number,
  slot: MealSlot,
  direction: 'up' | 'down',
): { dayOfWeek: number; slot: MealSlot } | null {
  const next = cellIndex(dayOfWeek, slot) + (direction === 'up' ? -1 : 1)
  if (next < 0 || next >= CELLS_PER_WEEK) return null
  return cellFromIndex(next)
}
