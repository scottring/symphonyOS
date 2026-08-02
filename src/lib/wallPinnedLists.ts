/**
 * The `symphony-wall-pinned-lists` localStorage key holds which lists this
 * wall shows on its face. Wall-local on purpose: what's on the kitchen
 * display is a decision made at the kitchen, not a personal sidebar pin, so
 * this is deliberately NOT the `pinned_items` table behind the app sidebar.
 *
 * Mirrors src/lib/hideRoutinesSignal.ts — native 'storage' events don't fire
 * in the tab that wrote the value, so we dispatch an in-tab custom event too.
 */
const KEY = 'symphony-wall-pinned-lists'
const EVENT = 'symphony-wall-pinned-lists-changed'

/** The right column already carries four cards; two pinned lists is the ceiling. */
export const MAX_WALL_PINNED_LISTS = 2

/** Dedupe, drop non-strings, and keep only the most recently pinned ids. */
function normalize(ids: unknown[]): string[] {
  const strings = ids.filter((id): id is string => typeof id === 'string')
  const deduped = strings.filter((id, i) => strings.indexOf(id) === i)
  return deduped.slice(-MAX_WALL_PINNED_LISTS)
}

export function readPinnedLists(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? normalize(parsed) : []
  } catch { return [] }
}

/** Returns the ids actually stored, after the cap is applied. */
export function writePinnedLists(ids: string[]): string[] {
  const next = normalize(ids)
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { ids: next } }))
  } catch { /* localStorage unavailable — silent fail */ }
  return next
}

/** Pin if absent, unpin if present. Pinning past the cap drops the oldest pin. */
export function togglePinnedList(id: string): string[] {
  const current = readPinnedLists()
  const next = current.includes(id)
    ? current.filter((x) => x !== id)
    : [...current, id]
  return writePinnedLists(next)
}

/** Subscribe to in-tab + cross-tab changes. Returns cleanup. */
export function onPinnedListsChange(cb: (ids: string[]) => void): () => void {
  const customHandler = (e: Event) => {
    const detail = (e as CustomEvent<{ ids: string[] }>).detail
    cb(detail?.ids ?? readPinnedLists())
  }
  const storageHandler = (e: StorageEvent) => {
    if (e.key === KEY) cb(readPinnedLists())
  }
  window.addEventListener(EVENT, customHandler)
  window.addEventListener('storage', storageHandler)
  return () => {
    window.removeEventListener(EVENT, customHandler)
    window.removeEventListener('storage', storageHandler)
  }
}
