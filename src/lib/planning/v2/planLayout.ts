// Lists or Open journal, per planning page, remembered on THIS device only.
// Open journal is the default (Scott, 2026-10-08, after PR #168); a device
// whose person chose Lists keeps Lists — an explicit choice always wins.
// Arriving from an onward step taken in the journal opens the journal for
// that visit without saving anything.
export type PlanLayout = 'lists' | 'journal'
const key = (page: 'month' | 'week') => `symphony-plan-layout.${page}`
export function readPlanLayout(page: 'month' | 'week'): PlanLayout {
  try { return localStorage.getItem(key(page)) === 'lists' ? 'lists' : 'journal' } catch { return 'journal' }
}
export function writePlanLayout(page: 'month' | 'week', v: PlanLayout): void {
  try { localStorage.setItem(key(page), v) } catch { /* this visit only */ }
}
