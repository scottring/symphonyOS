import type { TimelineItem } from '@/types/timeline'

const ROUTINE_DEFAULT_DURATION_MIN = 30
const ZERO_LENGTH_FLOOR_MIN = 15

/**
 * Effective end-minute for layout. Routines with endTime: null default to 30
 * min (matches WeekEventBlock.computePlacement's existing default). Zero-
 * length or inverted endTime falls back to a 15-min floor so layout is sane.
 */
export function getEffectiveEndMin(start: Date, end: Date | null): number {
  const startMin = start.getHours() * 60 + start.getMinutes()
  if (!end) return startMin + ROUTINE_DEFAULT_DURATION_MIN
  const endMin = end.getHours() * 60 + end.getMinutes()
  if (endMin <= startMin) return startMin + ZERO_LENGTH_FLOOR_MIN
  return endMin
}

/**
 * One item placed in the week grid, with its assigned lane.
 *
 *   dayIdx     0..(dayCount-1)
 *   laneIdx    0..(laneCount-1) within the item's overlap cluster
 *   laneCount  total lanes in this item's cluster (>=1)
 */
export interface PlacedItem {
  item: TimelineItem
  dayIdx: number
  laneIdx: number
  laneCount: number
}

/**
 * Compute side-by-side lane placement for items in a week grid.
 *
 * Algorithm:
 *   1. Group items by day (0..dayCount-1 from weekStart).
 *   2. Within each day, sort by (startMin asc, endMin desc).
 *   3. Sweep to form overlap clusters (groups whose intervals touch transitively).
 *   4. Within each cluster, assign each item to the lowest-index lane whose
 *      previous occupant has already ended; track laneCount = max lanes used.
 *
 * Returns a flat array of PlacedItem with stable ordering: day asc, then
 * cluster-order (which preserves the (startMin asc, endMin desc) input order).
 */
export function layoutWeekLanes(
  items: TimelineItem[],
  weekStart: Date,
  dayCount: number,
): PlacedItem[] {
  const weekStartMidnight = new Date(weekStart)
  weekStartMidnight.setHours(0, 0, 0, 0)

  const placed: PlacedItem[] = []
  for (const item of items) {
    if (!item.startTime) continue
    const dayIdx = daysBetween(weekStartMidnight, item.startTime)
    if (dayIdx < 0 || dayIdx >= dayCount) continue
    placed.push({ item, dayIdx, laneIdx: 0, laneCount: 1 })
  }
  return placed
}

function daysBetween(from: Date, to: Date): number {
  const a = new Date(from); a.setHours(0, 0, 0, 0)
  const b = new Date(to);   b.setHours(0, 0, 0, 0)
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}
