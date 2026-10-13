// src/lib/sharedLoad.ts
//
// One trip to the database for every hook instance that asks for the same
// thing while it is in flight — the pattern useSupabaseTasks and useGoals use,
// for the other per-instance loaders. Prod, 2026-10-13: Month's first paint
// fired 82 Supabase requests in half a second (households ×7, contacts ×4,
// calendar mappings ×4…), each one queueing behind the rest.
//
// No cache: a load that has finished is never reused, so a later mount or a
// refresh still goes back to the database, and writes behave as before.

const inFlight = new Map<string, Promise<unknown>>()

/** Run `load` once per `key` at a time; callers that ask meanwhile share it. */
export function sharedLoad<T>(key: string, load: () => PromiseLike<T>): Promise<T> {
  const running = inFlight.get(key)
  if (running) return running as Promise<T>
  const promise = Promise.resolve(load())
  inFlight.set(key, promise)
  const clear = () => { if (inFlight.get(key) === promise) inFlight.delete(key) }
  promise.then(clear, clear)
  return promise
}

/** Test seam — module state outlives a single test. */
export function __resetSharedLoads(): void {
  inFlight.clear()
}
