/**
 * When the School pool was last opened.
 *
 * Modelled on lib/today/sectionCollapse.ts: native 'storage' events don't fire
 * in the tab that wrote the value, so an in-tab custom event goes out too.
 *
 * Per-device by design, like the other view state — clearing it on the laptop
 * does not clear it in the Mac app. Cross-device would mean a column and a
 * write on every open, which a "have I looked at this" marker does not earn.
 */
const KEY = 'symphony-school-seen-at'
const EVENT = 'symphony-school-seen-changed'

/** null means never opened — every candidate then counts as new, which is
 *  honest on first run and self-resolves the moment the pool is opened. */
export function readSchoolSeenAt(): Date | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const at = new Date(raw)
    return Number.isNaN(at.getTime()) ? null : at
  } catch {
    return null
  }
}

export function writeSchoolSeenAt(at: Date): void {
  try {
    localStorage.setItem(KEY, at.toISOString())
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { value: at } }))
  } catch { /* localStorage unavailable — silent, same as sectionCollapse */ }
}

/** Subscribe to in-tab + cross-tab changes. Returns cleanup. */
export function onSchoolSeenChange(cb: (value: Date | null) => void): () => void {
  const custom = (e: Event) => {
    const detail = (e as CustomEvent<{ value: Date }>).detail
    cb(detail?.value ?? readSchoolSeenAt())
  }
  const storage = (e: StorageEvent) => {
    if (e.key === KEY) cb(readSchoolSeenAt())
  }
  window.addEventListener(EVENT, custom)
  window.addEventListener('storage', storage)
  return () => {
    window.removeEventListener(EVENT, custom)
    window.removeEventListener('storage', storage)
  }
}
