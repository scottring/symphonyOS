/**
 * In-tab signal that the calendar changed because WE changed it — an event
 * created, moved or deleted through the app.
 *
 * Google's events have no realtime channel, so anything holding its own copy
 * has no way to learn that a write landed. The view calendar refetches
 * because the component that wrote it also owns the fetch; the planning
 * calendar behind the day tiles (`useDayLoadEvents`) is a module-level cache
 * with no such owner, and without this it would keep reporting the day's old
 * count for as long as the tab stayed open.
 *
 * Deliberately NOT a poll. It fires on a successful write and nothing else.
 * Same shape as instancesChangedSignal.
 */
const EVENT = 'symphony:calendar-changed'

export function emitCalendarChanged(): void {
  try {
    window.dispatchEvent(new CustomEvent(EVENT))
  } catch {
    // non-browser environment — nothing to notify
  }
}

/** Subscribe to calendar writes made in this tab. Returns cleanup. */
export function onCalendarChanged(cb: () => void): () => void {
  window.addEventListener(EVENT, cb)
  return () => window.removeEventListener(EVENT, cb)
}
