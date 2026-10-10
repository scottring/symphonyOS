// src/components/canvas/week/compactWeek.ts
//
// The week's rows under the line each one serves (its month milestone), the
// parent written ONCE. Pure. Groups keep the order their first row had, rows
// keep the person's own order inside a group, and rows that serve nothing
// visible come last, together — "Unlinked" is a group like any other, not a
// warning.

export interface RowParent { id: string; title: string }

export interface ParentGroup<R> {
  key: string
  /** null: the Unlinked group. */
  parent: RowParent | null
  rows: R[]
}

export function groupByParent<R extends { parent?: RowParent | null }>(rows: readonly R[]): ParentGroup<R>[] {
  const groups = new Map<string, ParentGroup<R>>()
  const unlinked: R[] = []
  for (const r of rows) {
    if (!r.parent) { unlinked.push(r); continue }
    const g = groups.get(r.parent.id)
    if (g) g.rows.push(r)
    else groups.set(r.parent.id, { key: `p:${r.parent.id}`, parent: r.parent, rows: [r] })
  }
  const out = [...groups.values()]
  if (unlinked.length) out.push({ key: 'unlinked', parent: null, rows: unlinked })
  return out
}

/** The viewed day in words: "today", or its weekday when it is another day
 *  (a week row is added to THAT day, and the tag names it). */
export function dayWordFor(day: Date, now = new Date()): { word: string; tag: string } {
  const same = day.getFullYear() === now.getFullYear() && day.getMonth() === now.getMonth() && day.getDate() === now.getDate()
  if (same) return { word: 'today', tag: 'Today' }
  const name = day.toLocaleDateString('en-US', { weekday: 'long' })
  return { word: name, tag: name }
}

/** "Tue 13": a day of the week as a chip names it. */
export function dayChipLabel(d: Date): string {
  return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${d.getDate()}`
}
