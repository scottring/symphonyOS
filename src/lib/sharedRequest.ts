const inFlight = new Map<string, Promise<unknown>>()

/**
 * Collapse identical concurrent loads into one request.
 *
 * Several instances of the same hook mount in a single render pass — one route
 * mounts family_members ten times, projects eight, notes eight — and each used
 * to issue its own query. Measured on prod, a Today load fired 86 REST requests
 * of which 58 were exact duplicates, and they queued behind each other for 42
 * seconds.
 *
 * Only a request ALREADY IN FLIGHT is shared, never a completed one: a caller
 * arriving later must see current data. Callers each get the same resolved
 * value, so treat it as read-only or copy before mutating.
 */
export function shareInFlight<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key)
  if (existing) return existing as Promise<T>

  const started = run().finally(() => {
    if (inFlight.get(key) === started) inFlight.delete(key)
  })
  inFlight.set(key, started)
  return started
}

/** Test seam — the map is module state and outlives a single test. */
export function __resetSharedRequests(): void {
  inFlight.clear()
}
