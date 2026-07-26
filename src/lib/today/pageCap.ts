/**
 * Bounding a long section without lying about it.
 *
 * "A cap that hides its own truncation is worse than a long page. The count is
 * always visible." Completed rows are hidden first: burying a to-do behind a
 * done item inverts the point of the page.
 *
 * The caller's ordering is preserved among whatever survives, so a cap never
 * also reshuffles the list.
 */
export const DEFAULT_SECTION_CAP = 8

export interface CappedSection<T> {
  visible: T[]
  hiddenCount: number
}

export function capItems<T extends { completed: boolean }>(
  items: T[],
  cap: number,
  expanded: boolean,
): CappedSection<T> {
  if (expanded || cap <= 0 || items.length <= cap) {
    return { visible: items, hiddenCount: 0 }
  }

  const incomplete = items.filter((i) => !i.completed)
  const done = items.filter((i) => i.completed)
  const kept = new Set<T>([
    ...incomplete.slice(0, cap),
    ...done.slice(0, Math.max(0, cap - incomplete.length)),
  ])

  // Filter the ORIGINAL list so the incomplete/done split above decides only
  // WHAT survives, never the order it reads in.
  const visible = items.filter((i) => kept.has(i))
  return { visible, hiddenCount: items.length - visible.length }
}

/**
 * Cap a list that contains GROUPS, without ever splitting one.
 *
 * Today renders a group as a parent row followed immediately by its children,
 * drawn as one enclosed card whose borders are derived from adjacency. Cutting
 * that run in half renders a card with no bottom edge, or children with a
 * parent chip and no card at all. So the unit of capping is the whole run, not
 * the row.
 *
 * `startsUnit(item, index)` returns true when `item` begins a new unit — i.e.
 * it is NOT a child continuing the run above it.
 */
export function capUnits<T extends { completed: boolean }>(
  items: T[],
  cap: number,
  expanded: boolean,
  startsUnit: (item: T, index: number) => boolean,
): CappedSection<T> {
  if (expanded || cap <= 0 || items.length <= cap) {
    return { visible: items, hiddenCount: 0 }
  }

  const units: T[][] = []
  items.forEach((item, i) => {
    if (i === 0 || startsUnit(item, i)) units.push([item])
    else units[units.length - 1].push(item)
  })

  // Same honesty rule as capItems: fully-completed units go first, and the
  // original order survives among whatever is kept.
  const isDone = (u: T[]) => u.every((i) => i.completed)
  const live = units.filter((u) => !isDone(u))
  const done = units.filter(isDone)

  const kept = new Set<T[]>()
  let budget = cap
  for (const u of [...live, ...done]) {
    if (u.length > budget) continue
    kept.add(u)
    budget -= u.length
  }

  const visible = units.filter((u) => kept.has(u)).flat()
  return { visible, hiddenCount: items.length - visible.length }
}
