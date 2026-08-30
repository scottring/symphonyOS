/** Serializes async work per key: two calls for the SAME key run one at a
 * time, in call order; calls for different keys run independently. Used to
 * close read-modify-write races (e.g. rapid target-progress chip taps) where
 * a second call must not read stale state written before the first call's
 * write lands.
 *
 * `map` is owned by the caller (module- or ref-level) so it can be shared
 * across every call site that needs the same serialization domain. A failed
 * run still rejects for ITS caller, but never poisons the chain for the next
 * caller on the same key. */
export function chainPerKey<T>(
  map: Map<string, Promise<unknown>>,
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prior = map.get(key) ?? Promise.resolve()
  const result = prior.then(fn, fn)
  // Track a settled-either-way derivative so the NEXT caller waits for this
  // run to finish without inheriting this run's rejection.
  map.set(key, result.then(() => undefined, () => undefined))
  return result
}
