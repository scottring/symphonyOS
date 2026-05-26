export interface LaneInput {
  id: string
  startMinutes: number
  endMinutes: number
}

export interface Lane {
  column: number
  totalColumns: number
}

/**
 * Assign side-by-side lanes to time-overlapping items so the renderer can lay
 * them out next to each other instead of stacked on top of one another.
 *
 * Items whose [start, end) intervals overlap — directly or transitively — form a
 * group; each item in a group gets a `column` index and the group's
 * `totalColumns`. Non-overlapping items get `{ column: 0, totalColumns: 1 }`
 * (full width). Type-agnostic: a task, event, and routine at the same time share
 * one group, keyed only by `id`.
 *
 * This is the overlap algorithm previously inlined for tasks in PlanningColumn,
 * now extracted so it can run once across ALL placed item types.
 */
export function assignOverlapLanes(items: LaneInput[]): Map<string, Lane> {
  const sorted = [...items].sort((a, b) => a.startMinutes - b.startMinutes)
  const result = new Map<string, Lane>()
  const processed = new Set<number>()

  for (let i = 0; i < sorted.length; i++) {
    if (processed.has(i)) continue

    // Build the group of items overlapping this one (transitively, via maxEnd).
    const group: number[] = [i]
    let maxEnd = sorted[i].endMinutes

    for (let j = i + 1; j < sorted.length; j++) {
      if (processed.has(j)) continue
      if (sorted[j].startMinutes < maxEnd) {
        group.push(j)
        maxEnd = Math.max(maxEnd, sorted[j].endMinutes)
      }
    }

    const totalColumns = group.length
    group.forEach((idx, col) => {
      result.set(sorted[idx].id, { column: col, totalColumns })
      processed.add(idx)
    })
  }

  return result
}
