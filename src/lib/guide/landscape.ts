// The year's 12-month landscape (spec 2026-11-01): one cell of free text per
// month, one entry per line. A month with CROWDED or more entries is crowded.

/** Entries in a month at which it reads as crowded. */
export const CROWDED = 3

/** A month's entries: its non-empty lines. */
export function entriesOf(text: string): number {
  return text.split('\n').filter((l) => l.trim()).length
}
