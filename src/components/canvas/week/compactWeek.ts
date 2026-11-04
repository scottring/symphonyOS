// src/components/canvas/week/compactWeek.ts
//
// Small words for the compact week list. The rows themselves are flat
// (paper-style horizons, 2026-11-04): nothing groups them by what they serve.

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
