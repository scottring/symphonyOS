/**
 * In-tab signal that actionable_instances changed outside the Today view's own
 * action handlers (e.g. checking a routine step from the detail panel, which
 * mounts outside the ScheduleActions provider). There is no realtime
 * subscription on actionable_instances, so views that cache per-date instances
 * subscribe here to re-fetch.
 */
const EVENT = 'symphony:instances-changed'

export function emitInstancesChanged(): void {
  try {
    window.dispatchEvent(new CustomEvent(EVENT))
  } catch {
    // non-browser environment — nothing to notify
  }
}

/** Subscribe to instance changes. Returns cleanup. */
export function onInstancesChanged(cb: () => void): () => void {
  window.addEventListener(EVENT, cb)
  return () => window.removeEventListener(EVENT, cb)
}
