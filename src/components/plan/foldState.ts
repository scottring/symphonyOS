// src/components/plan/foldState.ts
//
// Whether a fold on a planning page is open, remembered across visits. Shared
// by the rail (the level above) and the calendar fold, so both behave the same
// way and neither owns the storage convention.

export function readOpen(key: string | undefined): boolean {
  if (!key) return false
  try { return localStorage.getItem(key) === 'open' } catch { return false }
}

export function writeOpen(key: string | undefined, open: boolean): void {
  if (!key) return
  try { localStorage.setItem(key, open ? 'open' : 'collapsed') } catch { /* private browsing */ }
}
