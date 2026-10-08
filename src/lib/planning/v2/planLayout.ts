// Lists or Open journal, per planning page, remembered on THIS device only
// (2026-10-08). The page's default stays Lists, so nobody's page changes
// under them; arriving from an onward step taken in the journal opens the
// journal for that visit without saving anything.
export type PlanLayout = 'lists' | 'journal'
const key = (page: 'month' | 'week') => `symphony-plan-layout.${page}`
export function readPlanLayout(page: 'month' | 'week'): PlanLayout {
  try { return localStorage.getItem(key(page)) === 'journal' ? 'journal' : 'lists' } catch { return 'lists' }
}
export function writePlanLayout(page: 'month' | 'week', v: PlanLayout): void {
  try { localStorage.setItem(key(page), v) } catch { /* this visit only */ }
}
