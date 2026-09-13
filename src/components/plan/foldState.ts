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

/** What the reader has SAID about a fold, or null if they never have.
 *
 *  Hiding finished work is a choice that should stick (Scott, 2026-09-13:
 *  "make it so that you can hide completed tasks"), but a plain boolean read
 *  cannot tell "collapsed on purpose" from "never touched" — and the caller
 *  needs that difference to pick a sensible default per period. Read at
 *  render, never frozen into initial state: the default follows the period
 *  you are LOOKING at, which changes as you page. */
export function readFoldPref(key: string | undefined): boolean | null {
  if (!key) return null
  try {
    const raw = localStorage.getItem(key)
    return raw === 'open' ? true : raw === 'collapsed' ? false : null
  } catch {
    return null
  }
}
