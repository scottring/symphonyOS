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
