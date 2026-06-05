export interface MonthGridCell {
  date: Date
  /** true when the day belongs to the target month (vs. leading/trailing pad) */
  inMonth: boolean
}

/**
 * Build a Sunday-start calendar grid of whole weeks for the given month.
 * Leading days come from the previous month and trailing days from the next,
 * each flagged `inMonth: false`, so the grid always fills complete week rows.
 *
 * @param year  full year, e.g. 2026
 * @param month 0-indexed month (0 = January, 5 = June)
 */
export function buildMonthGrid(year: number, month: number): MonthGridCell[] {
  const firstOfMonth = new Date(year, month, 1)
  // Walk back to the Sunday on or before the 1st.
  const start = new Date(firstOfMonth)
  start.setDate(1 - firstOfMonth.getDay())

  const cells: MonthGridCell[] = []
  const cursor = new Date(start)
  // Emit whole weeks until we've passed the month and landed on a week boundary.
  do {
    for (let i = 0; i < 7; i++) {
      cells.push({ date: new Date(cursor), inMonth: cursor.getMonth() === month })
      cursor.setDate(cursor.getDate() + 1)
    }
  } while (cursor.getMonth() === month)

  return cells
}
