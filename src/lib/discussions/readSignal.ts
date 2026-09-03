/**
 * In-tab signal that the viewer just stamped a Discussion as read.
 *
 * Why: the sidebar badge and the panel's Discussion-chip dot are fed by
 * chat_session_reads, but their realtime subscriptions watch chat_sessions
 * (where messages land). A read stamp changes neither row, so without this
 * the badge sat at "1" after you'd opened the thread until the next tab
 * return. Same shape as instancesChangedSignal.
 */
const EVENT = 'symphony:discussion-read'

export function emitThreadRead(sessionId: string): void {
  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { sessionId } }))
  } catch {
    // non-browser environment — nothing to notify
  }
}

/** Subscribe to in-tab read stamps. Returns cleanup. */
export function onThreadRead(cb: (sessionId: string) => void): () => void {
  const handler = (e: Event) => {
    const id = (e as CustomEvent<{ sessionId?: unknown }>).detail?.sessionId
    if (typeof id === 'string') cb(id)
  }
  window.addEventListener(EVENT, handler)
  return () => window.removeEventListener(EVENT, handler)
}
