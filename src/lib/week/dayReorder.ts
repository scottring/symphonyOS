// Drag to order within a day (Task 13, Scott 2026-10-18: with two things shown
// a day, the order IS the priority). A drop inside its own day lands in the
// gap between two task rows, read from where the pointer let go; the gap is
// then turned into a place in the whole day, for `reorderTasksToIndex`.

/** The gap at viewport `y` among rows (top to bottom): 0 is above the first
 *  row, `rows.length` below the last. Above a row's middle is the gap above it. */
export function gapAt(y: number, rows: { top: number; bottom: number }[]): number {
  const i = rows.findIndex((r) => y < (r.top + r.bottom) / 2)
  return i === -1 ? rows.length : i
}

/** A gap among the SHOWN rows (a folded day shows two) as a place in the whole
 *  day's order: the gap above a shown row is that row's place; the gap after
 *  the last shown row is just after it. */
export function gapToListIndex(gap: number, shownIds: string[], orderedIds: string[]): number {
  if (shownIds.length === 0) return 0
  if (gap < shownIds.length) return Math.max(0, orderedIds.indexOf(shownIds[gap]))
  return orderedIds.indexOf(shownIds[shownIds.length - 1]) + 1
}
