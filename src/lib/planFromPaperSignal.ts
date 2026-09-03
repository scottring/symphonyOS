/**
 * "Plan from paper" is asked for from the sidenav — outside the Home view
 * that owns the photograph → review → place flow. This is the one-line bus
 * between them: the sidenav asks, a mounted Home view answers. If nothing is
 * mounted to answer (the user is on Contacts, say), the request stays
 * pending and the sidenav sends them to Today, whose container consumes it
 * on mount.
 */
const EVENT = 'symphony:plan-from-paper'

let pending = false

/** Ask for the flow. Returns true when a mounted view took it. */
export function requestPlanFromPaper(): boolean {
  const detail = { handled: false }
  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail }))
  } catch {
    // non-browser environment
  }
  pending = !detail.handled
  return detail.handled
}

/** A view that can run the flow subscribes here. Returns cleanup. */
export function onPlanFromPaperRequest(cb: () => void): () => void {
  const handler = (e: Event) => {
    ;(e as CustomEvent<{ handled: boolean }>).detail.handled = true
    cb()
  }
  window.addEventListener(EVENT, handler)
  return () => window.removeEventListener(EVENT, handler)
}

/** On mount: was the flow asked for before this view existed? Clears it. */
export function consumePlanFromPaperRequest(): boolean {
  const was = pending
  pending = false
  return was
}
