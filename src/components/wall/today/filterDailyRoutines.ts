import type { TodayItem } from './todayItem'

/**
 * When `hideDaily` is on, drop items that are everyday-recurring routine
 * steps (the low-value "brush teeth / get dressed" clutter). Tasks, events,
 * and non-everyday routines are always kept. Returns the original array
 * reference unchanged when the toggle is off (stable identity for memo deps).
 */
export function filterDailyRoutines(
  items: TodayItem[],
  hideDaily: boolean,
): TodayItem[] {
  if (!hideDaily) return items
  return items.filter(i => !i.isEverydayRoutine)
}
