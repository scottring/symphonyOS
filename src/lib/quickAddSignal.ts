/**
 * "Add task" from anywhere the shell's unibox is not in scope (the Planning
 * panel in the dock, the phone's Planning sheet). The shell owns the ⌘K
 * unibox's open state and listens here; a caller only asks.
 */
const EVENT = 'symphony-quick-add-requested'

export function requestQuickAdd(): void {
  try { window.dispatchEvent(new CustomEvent(EVENT)) } catch { /* no window */ }
}

/** Subscribe to requests. Returns cleanup. */
export function onQuickAddRequest(cb: () => void): () => void {
  window.addEventListener(EVENT, cb)
  return () => window.removeEventListener(EVENT, cb)
}
