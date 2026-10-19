// Which view of Choose (step 1 of planning) this viewer used last — One at a
// time by default (the card design approved 2026-10-19). A per-device convenience: it never decides what is saved.

export type ChooseViewMode = 'all' | 'one'

const VIEW_KEY = 'symphony-choose-view'

export function readChooseView(): ChooseViewMode {
  try { return localStorage.getItem(VIEW_KEY) === 'all' ? 'all' : 'one' } catch { return 'one' }
}

export function writeChooseView(v: ChooseViewMode) {
  try { localStorage.setItem(VIEW_KEY, v) } catch { /* a convenience only */ }
}
