// The month at a glance's rows: the weeks that hold any of the month's days,
// from the week its first falls in. Four to six, by the month and the week's
// first day; the calendar sheet's grid and the week list under it both read
// this, so a six-row month never loses its last days (final review, 2026-11-04).

import { weekStartAnchor, type WeekStart } from '@/lib/cadence/config'

export function monthGridWeeks(month: Date, weekStartsOn: WeekStart): Date[][] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const next = new Date(month.getFullYear(), month.getMonth() + 1, 1)
  const weeks: Date[][] = []
  for (let d = weekStartAnchor(first, weekStartsOn); d < next; ) {
    const row: Date[] = []
    for (let i = 0; i < 7; i++) {
      row.push(d)
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
    }
    weeks.push(row)
  }
  return weeks
}
