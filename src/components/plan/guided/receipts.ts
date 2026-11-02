// What a look back's call did, said on its own row (walk 2026-11-02: "Smaller"
// saved a step, but the row looked exactly as before and the only word of it
// was "Saved" in the conversation panel). A decided row keeps its place and
// says what happened: "Smaller step on this week: “buy frames”". A row the
// call took off the list (moved, dropped, done) stays where it was as that
// one line, so the list does not jump; a row still on the list offers Change
// to decide again.

import { useCallback, useState } from 'react'

export interface Receipt { title: string; text: string; at: number }

export function useReceipts() {
  const [said, setSaid] = useState<Record<string, Receipt>>({})
  const record = useCallback((key: string, r: Receipt) => setSaid((s) => ({ ...s, [key]: r })), [])
  const clear = useCallback((key: string) => setSaid((s) => { const n = { ...s }; delete n[key]; return n }), [])
  return { said, record, clear }
}

/** The list as drawn: its open rows, with each decided row that left it back
 *  in the place it had when it was decided. */
export function withReceipts<T>(open: readonly T[], keyOf: (t: T) => string, said: Record<string, Receipt>):
  ({ key: string; item: T } | { key: string; gone: Receipt })[] {
  const rows: ({ key: string; item: T } | { key: string; gone: Receipt })[] = open.map((item) => ({ key: keyOf(item), item }))
  const here = new Set(rows.map((r) => r.key))
  Object.entries(said).filter(([k]) => !here.has(k)).sort((a, b) => a[1].at - b[1].at)
    .forEach(([key, gone]) => rows.splice(Math.min(gone.at, rows.length), 0, { key, gone }))
  return rows
}
