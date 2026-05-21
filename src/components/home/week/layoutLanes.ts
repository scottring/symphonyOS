import type { TimelineItem } from '@/types/timeline'

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
  return []
}
