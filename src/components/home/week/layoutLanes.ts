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
  /** This block's interval strictly contains ≥1 other item's — it renders
   *  full-width as a background container (mockup 2026-09-01). */
  isContainer?: boolean
  /** This block sits fully inside a container's interval — it renders on top,
   *  inset, as a card. laneIdx/laneCount are computed among non-containers. */
  embedded?: boolean
  /** Absolute minute-of-day this block's VISUAL top must not rise above, so
   *  it clears an overlapping container's title line. Render-only nudge. */
  clearedTopMin?: number
}

// A block whose top lands within this many minutes of a container's top
// would cover the container's title — floor it at the clearance line.
// A container carrying a subtitle (School's specials) owns a taller band.
const TITLE_CLEARANCE_MIN = 20
const SUBTITLE_CLEARANCE_MIN = 34

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
  /** Minute-of-day where the visible grid starts (e.g. 8*60). When given,
   *  title clearance uses CLAMPED visual positions, so a pre-grid item that
   *  the renderer pins to the top edge still clears a container's title. */
  gridStartMin?: number,
): PlacedItem[] {
  const weekStartMidnight = new Date(weekStart)
  weekStartMidnight.setHours(0, 0, 0, 0)

  // Bucket valid items by day.
  const byDay: Map<number, Array<{ item: TimelineItem; startMin: number; endMin: number }>> = new Map()
  for (const item of items) {
    if (!item.startTime) continue
    const dayIdx = daysBetween(weekStartMidnight, item.startTime)
    if (dayIdx < 0 || dayIdx >= dayCount) continue
    const startMin = item.startTime.getHours() * 60 + item.startTime.getMinutes()
    const endMin = getEffectiveEndMin(item.startTime, item.endTime)
    if (!byDay.has(dayIdx)) byDay.set(dayIdx, [])
    byDay.get(dayIdx)!.push({ item, startMin, endMin })
  }

  const placed: PlacedItem[] = []
  // Stable day order: 0..dayCount-1.
  for (let dayIdx = 0; dayIdx < dayCount; dayIdx++) {
    const dayItems = byDay.get(dayIdx)
    if (!dayItems) continue

    // Sort by (startMin asc, endMin desc) so ties are broken by longer-first.
    dayItems.sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin)

    // Containment pass (mockup 2026-09-01): a block that strictly contains
    // another renders full-width as a background container; contained blocks
    // render on top as inset cards. Containers are excluded from lane math so
    // a long School block never squeezes the day into slivers.
    const contains = (a: { startMin: number; endMin: number }, b: { startMin: number; endMin: number }) =>
      a.startMin <= b.startMin && a.endMin >= b.endMin &&
      (a.endMin - a.startMin) > (b.endMin - b.startMin)
    const embedded = dayItems.map((it) => dayItems.some((other) => other !== it && contains(other, it)))
    const isContainerPre = dayItems.map((it, i) =>
      !embedded[i] && dayItems.some((other, j) => j !== i && contains(it, other)),
    )
    // Floor any non-container block that overlaps a container's title band
    // below the title line (lowest container line wins across containers).
    // Covers both contained items starting at the container top AND early
    // items the grid clamps to the top edge.
    // Visual position after the renderer's top-clamp (WeekEventBlock pins
    // pre-grid starts to the grid top with a min height).
    const vis = (x: { startMin: number; endMin: number }) => {
      const start = gridStartMin != null ? Math.max(x.startMin, gridStartMin) : x.startMin
      return { start, end: Math.max(x.endMin, start + ZERO_LENGTH_FLOOR_MIN) }
    }
    const clearedTop = dayItems.map((it, i) => {
      if (isContainerPre[i]) return 0
      const v = vis(it)
      let floor = 0
      for (let j = 0; j < dayItems.length; j++) {
        const c = dayItems[j]
        if (!isContainerPre[j] || c === it) continue
        const cv = vis(c)
        const clearance = c.item.subtitle ? SUBTITLE_CLEARANCE_MIN : TITLE_CLEARANCE_MIN
        const overlaps = v.start < cv.end && v.end > cv.start
        if (overlaps && v.start < cv.start + clearance) {
          floor = Math.max(floor, cv.start + clearance)
        }
      }
      return floor
    })
    const isContainer = isContainerPre

    for (let i = 0; i < dayItems.length; i++) {
      if (!isContainer[i]) continue
      placed.push({ item: dayItems[i].item, dayIdx, laneIdx: 0, laneCount: 1, isContainer: true })
    }

    // Sweep the remaining (non-container) items to form clusters; assign
    // lanes within each cluster.
    const laneItems = dayItems.filter((_, i) => !isContainer[i])
    const laneEmbedded = embedded.filter((_, i) => !isContainer[i])
    const laneClearedTop = clearedTop.filter((_, i) => !isContainer[i])
    let clusterStart = 0
    let clusterMaxEnd = -Infinity
    for (let i = 0; i <= laneItems.length; i++) {
      const cur = laneItems[i]
      if (i < laneItems.length && (clusterMaxEnd === -Infinity || cur.startMin < clusterMaxEnd)) {
        // Extend (or open) current cluster.
        clusterMaxEnd = Math.max(clusterMaxEnd, cur.endMin)
        continue
      }
      // Close cluster [clusterStart, i): assign lanes.
      const cluster = laneItems.slice(clusterStart, i)
      const laneEnds: number[] = []
      const laneIdxByItem: number[] = []
      for (const entry of cluster) {
        let lane = laneEnds.findIndex(e => e <= entry.startMin)
        if (lane === -1) {
          lane = laneEnds.length
          laneEnds.push(entry.endMin)
        } else {
          laneEnds[lane] = entry.endMin
        }
        laneIdxByItem.push(lane)
      }
      const laneCount = laneEnds.length
      for (let j = 0; j < cluster.length; j++) {
        placed.push({
          item: cluster[j].item,
          dayIdx,
          laneIdx: laneIdxByItem[j],
          laneCount,
          ...(laneEmbedded[clusterStart + j] ? { embedded: true } : {}),
          ...(laneClearedTop[clusterStart + j] > 0 ? { clearedTopMin: laneClearedTop[clusterStart + j] } : {}),
        })
      }
      // Open next cluster starting at i.
      clusterStart = i
      clusterMaxEnd = cur ? cur.endMin : -Infinity
    }
  }

  return placed
}

function daysBetween(from: Date, to: Date): number {
  const a = new Date(from); a.setHours(0, 0, 0, 0)
  const b = new Date(to);   b.setHours(0, 0, 0, 0)
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}
