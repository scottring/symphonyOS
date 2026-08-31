export interface LaneInput {
  id: string
  startMinutes: number
  endMinutes: number
}

export interface Lane {
  column: number
  totalColumns: number
}

/** A collapsed cluster of items that didn't fit within the lane cap. */
export interface OverflowChip {
  id: string
  column: number
  totalColumns: number
  startMinutes: number
  itemIds: string[]
}

export interface LaneLayout {
  /** Items that get a visible side-by-side lane. */
  lanes: Map<string, Lane>
  /** "+N" chips standing in for the items that exceeded the cap. */
  chips: OverflowChip[]
}

/**
 * Lay out time-overlapping items into side-by-side lanes so they don't stack on
 * top of each other. Type-agnostic — keyed only by `id`, so tasks, events, and
 * routines sharing a time share one group.
 *
 * Groups are formed from items whose [start, end) intervals overlap (directly or
 * transitively). A group of N items:
 *   - N <= maxColumns → each item gets its own full lane (totalColumns = N).
 *   - N >  maxColumns → the first (maxColumns - 1) items get lanes; the rest
 *     collapse into a single "+N" chip occupying the last lane, so the visible
 *     cards never shred into unreadable slivers.
 */
export function layoutLanes(items: LaneInput[], maxColumns = 4): LaneLayout {
  const cap = Math.max(2, maxColumns)
  // Dedupe by id first. The layout is keyed by id (lanes is a Map), so a
  // duplicate input (the same event fed twice) can't get two lanes anyway —
  // but it DID inflate the group count past the cap, collapsing real items
  // into a "+N" chip beside visually empty lanes (all the duplicate "lanes"
  // rendered as one block).
  const seen = new Set<string>()
  const unique = items.filter((it) => (seen.has(it.id) ? false : (seen.add(it.id), true)))
  const sorted = [...unique].sort((a, b) => a.startMinutes - b.startMinutes)
  const lanes = new Map<string, Lane>()
  const chips: OverflowChip[] = []
  const processed = new Set<number>()

  for (let i = 0; i < sorted.length; i++) {
    if (processed.has(i)) continue

    const group: number[] = [i]
    let maxEnd = sorted[i].endMinutes
    for (let j = i + 1; j < sorted.length; j++) {
      if (processed.has(j)) continue
      if (sorted[j].startMinutes < maxEnd) {
        group.push(j)
        maxEnd = Math.max(maxEnd, sorted[j].endMinutes)
      }
    }
    group.forEach((idx) => processed.add(idx))

    const n = group.length
    if (n <= cap) {
      group.forEach((idx, col) => lanes.set(sorted[idx].id, { column: col, totalColumns: n }))
    } else {
      const visibleCount = cap - 1
      for (let col = 0; col < visibleCount; col++) {
        lanes.set(sorted[group[col]].id, { column: col, totalColumns: cap })
      }
      const overflow = group.slice(visibleCount)
      chips.push({
        id: `overflow-${sorted[overflow[0]].id}`,
        column: cap - 1,
        totalColumns: cap,
        startMinutes: sorted[overflow[0]].startMinutes,
        itemIds: overflow.map((idx) => sorted[idx].id),
      })
    }
  }

  return { lanes, chips }
}
