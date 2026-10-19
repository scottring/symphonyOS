// src/lib/loadPriority.ts
//
// The page's own data first; the rest after it.
//
// A cold load fires ~50 reads at once. On prod (2026-10-18) their durations
// came back in waves ~400ms apart — most likely the server answering a pool's
// worth at a time — so `tasks`, which every page waits on, could land in a
// late wave behind an assistant's chat history and a sidebar badge.
// Reads nobody sees on first paint wait here until the task list has arrived
// (or a few seconds pass), so they stop queueing ahead of it.
//
// Nothing is skipped and nothing is cached: a deferred read runs in full, a
// moment later.

/** Never hold a deferred read longer than this, whatever the page is doing. */
export const PAGE_DATA_MAX_WAIT_MS = 3000

let release: (() => void) | null = null
let gate: Promise<void> | null = null
let open = false
// Tests read synchronously after mount; the gate is opt-in there.
let enabled = import.meta.env.MODE !== 'test'

function ensureGate(): Promise<void> {
  if (!gate) {
    gate = new Promise<void>((resolve) => { release = resolve })
    // Started by the first waiter, so a page with no task list (signed out,
    // the join link) still lets everything through.
    setTimeout(markPageDataLoaded, PAGE_DATA_MAX_WAIT_MS)
  }
  return gate
}

/** The page's first data has arrived (or failed): let the deferred reads go. */
export function markPageDataLoaded(): void {
  if (open) return
  open = true
  release?.()
}

/** Resolves once the page's own data is in. Already open → resolves at once. */
export function afterPageData(): Promise<void> {
  if (!enabled || open) return Promise.resolve()
  return ensureGate()
}

/** Test seam: turn the gate on (or off) and start closed. */
export function __resetLoadPriority(on = false): void {
  enabled = on
  open = false
  gate = null
  release = null
}
