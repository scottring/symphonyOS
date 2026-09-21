/**
 * Whether the Planning panel's "Include unfinished from earlier" fold is
 * open. Session-scoped: the choice survives navigating between pages and
 * reopening the panel, and is forgotten when the tab closes, so the list
 * defaults to the week's own work again next time — never to the backlog.
 *
 * Today's "Review unfinished work" line sets it true before opening the panel,
 * so the panel it opens is the expanded one. Same in-tab event recipe as
 * hideRoutinesSignal: a 'storage' event never fires in the tab that wrote it.
 */
const KEY = 'symphony-planning-unfinished-open'
const EVENT = 'symphony-planning-unfinished-open-changed'

export function readUnfinishedOpen(): boolean {
  try { return sessionStorage.getItem(KEY) === 'true' }
  catch { return false }
}

export function writeUnfinishedOpen(value: boolean): void {
  try { sessionStorage.setItem(KEY, value ? 'true' : 'false') } catch { /* in-memory only */ }
  try { window.dispatchEvent(new CustomEvent(EVENT, { detail: { value } })) } catch { /* no window */ }
}

/** Subscribe to in-tab changes. Returns cleanup. */
export function onUnfinishedOpenChange(cb: (value: boolean) => void): () => void {
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<{ value: boolean }>).detail
    cb(detail?.value ?? readUnfinishedOpen())
  }
  window.addEventListener(EVENT, handler)
  return () => window.removeEventListener(EVENT, handler)
}
