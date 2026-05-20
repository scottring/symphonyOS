/**
 * The `symphony-hide-routines` localStorage key holds the user's
 * app-wide preference for hiding routines from Today + Week views.
 *
 * Native 'storage' events don't fire in the same tab that wrote the
 * value, so this util dispatches an in-tab custom event so other
 * subscribed views react immediately. Cross-tab sync also works via
 * the native 'storage' listener.
 */
const KEY = 'symphony-hide-routines'
const EVENT = 'symphony-hide-routines-changed'

export function readHideRoutines(): boolean {
  try { return localStorage.getItem(KEY) === 'true' }
  catch { return false }
}

export function writeHideRoutines(value: boolean): void {
  try {
    localStorage.setItem(KEY, value ? 'true' : 'false')
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { value } }))
  } catch { /* localStorage unavailable — silent fail */ }
}

/** Subscribe to in-tab + cross-tab changes. Returns cleanup. */
export function onHideRoutinesChange(cb: (value: boolean) => void): () => void {
  const customHandler = (e: Event) => {
    const detail = (e as CustomEvent<{ value: boolean }>).detail
    cb(detail?.value ?? readHideRoutines())
  }
  const storageHandler = (e: StorageEvent) => {
    if (e.key === KEY) cb(readHideRoutines())
  }
  window.addEventListener(EVENT, customHandler)
  window.addEventListener('storage', storageHandler)
  return () => {
    window.removeEventListener(EVENT, customHandler)
    window.removeEventListener('storage', storageHandler)
  }
}
