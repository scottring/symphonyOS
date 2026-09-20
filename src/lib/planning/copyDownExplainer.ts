// The first copy-down explains itself.
//
// Taking a month or season task down a rung COPIES it: the period keeps the
// row, marked "→ placed" and later "→ done", so the look-back still sees the
// whole plan. Nobody guesses that from a row that stays put. Scott,
// 2026-09-20, first real walkthrough: "we need an explanation to the user as
// to what happens with copy-down as it's not intuitive." So the first time
// it happens, and only the first time, the app says what it just did.
import { showToast } from '@/hooks/useToast'

export const COPY_DOWN_EXPLAINED_KEY = 'symphony-copy-down-explained'

function seen(): boolean {
  try { return localStorage.getItem(COPY_DOWN_EXPLAINED_KEY) === '1' } catch { return true }
}
function markSeen(): void {
  try { localStorage.setItem(COPY_DOWN_EXPLAINED_KEY, '1') } catch { /* private browsing */ }
}

/** The sentence, for tests and for any surface that wants it inline. */
export function copyDownExplanation(from: 'season' | 'month' | 'year', to: 'month' | 'week'): string {
  return `Copied into this ${to}. The ${from} keeps it as a record — it reads “→ placed” there, then “→ done” once you tick the copy.`
}

/** Say it once, ever. Returns true when it was said. */
export function explainCopyDownOnce(from: 'season' | 'month' | 'year', to: 'month' | 'week'): boolean {
  if (seen()) return false
  markSeen()
  showToast(copyDownExplanation(from, to), 'info', 12000)
  return true
}
