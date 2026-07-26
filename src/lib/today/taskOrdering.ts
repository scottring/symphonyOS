/**
 * Manual ordering for Today's untimed items (all-day, unscheduled, group
 * members). Timed items sort by time — see the Stage 2 spec.
 *
 * Gap-based on purpose. `lib/today/stepOrdering.ts` renormalises 0..n-1 on
 * every move, and its caller persists that with one DB write per item
 * (RoutinesApp.tsx:82). That is fine for a few routine steps; Today holds ~27
 * all-day items, so it would mean 27 writes plus 27 realtime echoes per drag.
 * With gaps of 1000, the common case is a single write.
 */
export const SORT_ORDER_GAP = 1000

export interface OrderWrite {
  id: string
  sortOrder: number
}

/** The sortOrder for a newly appended item. */
export function nextTaskSortOrder(items: { sortOrder?: number | null }[]): number {
  const orders = items.map((i) => i.sortOrder).filter((o): o is number => o != null)
  if (orders.length === 0) return 0
  return Math.max(...orders) + SORT_ORDER_GAP
}

/**
 * Ordered items first (by sortOrder), then never-ordered ones oldest-first.
 * A null sortOrder must NOT be read as 0 — 0 is a real first position.
 */
export function sortByManualOrder<
  T extends { id: string; sortOrder?: number | null; createdAt: Date },
>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const ao = a.sortOrder ?? null
    const bo = b.sortOrder ?? null
    if (ao != null && bo != null) return ao - bo
    if (ao != null) return -1
    if (bo != null) return 1
    return a.createdAt.getTime() - b.createdAt.getTime()
  })
}

/** Evenly spaced writes for the whole list, in the given id order. */
function renormalise(orderedIds: string[]): OrderWrite[] {
  return orderedIds.map((id, i) => ({ id, sortOrder: i * SORT_ORDER_GAP }))
}

/**
 * Move `activeId` into the GAP at `toIndex`. Index-based because Today's
 * reorder target is the gap between two rows rather than a row — a row already
 * means "group with me", so the two gestures need different targets (see
 * `lib/today/todayDrop.ts`).
 *
 * `toIndex` is a position in the list as it reads BEFORE the move: 0 is the gap
 * above the first row, `orderedIds.length` the gap below the last.
 *
 * Returns the minimal set of writes: one row when a gap exists between the new
 * neighbours, otherwise a full renormalise. Empty when the move is a no-op or
 * the id is unknown.
 */
export function reorderTasksToIndex(
  orderedIds: string[],
  activeId: string,
  toIndex: number,
  currentOrders: Map<string, number | null>,
): OrderWrite[] {
  const from = orderedIds.indexOf(activeId)
  if (from === -1) return []
  const clamped = Math.max(0, Math.min(toIndex, orderedIds.length))
  // The gaps immediately above and below yourself are both where you already
  // are. Without this, every micro-drag would write a row for no movement.
  if (clamped === from || clamped === from + 1) return []

  const moved = orderedIds.filter((id) => id !== activeId)
  // Removing the active item shifts every later index down by one.
  const insertAt = clamped > from ? clamped - 1 : clamped
  moved.splice(insertAt, 0, activeId)

  const pos = moved.indexOf(activeId)
  const beforeId = pos > 0 ? moved[pos - 1] : null
  const afterId = pos < moved.length - 1 ? moved[pos + 1] : null
  const before = beforeId ? currentOrders.get(beforeId) ?? null : null
  const after = afterId ? currentOrders.get(afterId) ?? null : null

  // Any participant without an order means there is nothing to interpolate
  // between — lay the whole list out cleanly instead.
  if ((beforeId && before == null) || (afterId && after == null)) {
    return renormalise(moved)
  }

  // Defensive: both neighbours null means moved.length === 1 (the item is
  // alone), which the no-op guard above already excludes. Kept because a future
  // caller might reach this through a different path.
  if (before == null && after == null) return renormalise(moved)
  if (before == null) return [{ id: activeId, sortOrder: after! - SORT_ORDER_GAP }]
  if (after == null) return [{ id: activeId, sortOrder: before + SORT_ORDER_GAP }]

  // No integer strictly between the neighbours — the gap is spent.
  if (after - before <= 1) return renormalise(moved)

  return [{ id: activeId, sortOrder: Math.floor((before + after) / 2) }]
}

/**
 * Move `activeId` to `overId`'s position. Delegates to `reorderTasksToIndex`
 * so the row-based and gap-based paths can never drift apart.
 *
 * Named apart from `stepOrdering.ts`'s `reorderByDrag` on purpose — that
 * sibling takes `Routine[]`, returns `{ id, step_order }` for the WHOLE list,
 * and is what RoutineStepsSection uses. Two same-named exports in one folder
 * with opposite persistence costs is a footgun; the names now say which is
 * which.
 */
export function reorderTasksByDrag(
  orderedIds: string[],
  activeId: string,
  overId: string,
  currentOrders: Map<string, number | null>,
): OrderWrite[] {
  if (activeId === overId) return []
  const from = orderedIds.indexOf(activeId)
  const to = orderedIds.indexOf(overId)
  if (from === -1 || to === -1) return []
  // arrayMove semantics: landing ON an index means taking that index. As a gap,
  // that is the gap above the target when moving up, below it when moving down.
  return reorderTasksToIndex(orderedIds, activeId, to > from ? to + 1 : to, currentOrders)
}
