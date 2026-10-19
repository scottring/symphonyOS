// Which view of Choose (step 1 of planning) this viewer used last — All at
// once by default. A per-device convenience: it never decides what is saved.

export type ChooseViewMode = 'all' | 'one'

const VIEW_KEY = 'symphony-choose-view'

export function readChooseView(): ChooseViewMode {
  try { return localStorage.getItem(VIEW_KEY) === 'one' ? 'one' : 'all' } catch { return 'all' }
}

export function writeChooseView(v: ChooseViewMode) {
  try { localStorage.setItem(VIEW_KEY, v) } catch { /* a convenience only */ }
}
