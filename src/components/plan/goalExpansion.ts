// src/components/plan/goalExpansion.ts
//
// Which goals are open, remembered across a detail round trip.
//
// It used to be plain component state, so opening a step, reading it and
// pressing Back collapsed every goal the reader had opened — on a month with
// thirty of them, that is the whole list to re-open (long-list acceptance,
// Scott 2026-09-24). Kept per period, so October's shape is not November's.
//
// Same storage manners as `foldState`: every read and write is guarded, and a
// private window simply forgets, which is no worse than the state it replaces.

const KEY = 'symphony.plan.expandedGoals'

export function expansionKey(level: string, periodStartYmd: string): string {
  return `${KEY}.${level}.${periodStartYmd}`
}

export function readExpanded(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return new Set()
    const ids = JSON.parse(raw)
    return Array.isArray(ids) ? new Set(ids.filter((x): x is string => typeof x === 'string')) : new Set()
  } catch {
    return new Set()
  }
}

export function writeExpanded(key: string, ids: ReadonlySet<string>): void {
  try {
    if (ids.size === 0) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify([...ids]))
  } catch { /* private browsing */ }
}
