import { lazy, type ComponentType } from 'react'

// Guards against an infinite reload loop: if a fresh load still fails after
// a reload, we let the error surface instead of reloading forever.
const RELOAD_FLAG = 'symphony:chunk-reload'

/**
 * True when an error looks like a failed dynamic import of a code-split
 * chunk. The common case in production: a redeploy purges the previous
 * deploy's hashed chunks, the SPA host serves index.html (text/html) for
 * the now-missing chunk, and the browser refuses to execute HTML as a
 * module. We treat that as "stale deploy → reload to get fresh hashes".
 */
export function isChunkLoadError(err: unknown): boolean {
  const msg =
    err instanceof Error ? `${err.name}: ${err.message}` : String(err)
  return /Loading chunk|Loading CSS chunk|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|expected a JavaScript-or-Wasm module|'text\/html'|MIME type/i.test(
    msg
  )
}

interface RetryDeps {
  reload: () => void
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
}

const defaultDeps = (): RetryDeps => ({
  reload: () => window.location.reload(),
  storage: window.sessionStorage,
})

/**
 * Wraps a dynamic-import factory so a stale-chunk failure triggers a
 * one-time full page reload (fetching the fresh index.html + new chunk
 * hashes) instead of bubbling to the error boundary. Exported separately
 * from `lazyWithRetry` so it can be unit-tested without React.
 */
export function createRetryingImport<T>(
  factory: () => Promise<T>,
  deps: RetryDeps = defaultDeps()
): () => Promise<T> {
  return async () => {
    try {
      const mod = await factory()
      // Successful load — clear the guard so a *future* deploy can
      // reload again.
      deps.storage.removeItem(RELOAD_FLAG)
      return mod
    } catch (err) {
      if (
        isChunkLoadError(err) &&
        deps.storage.getItem(RELOAD_FLAG) !== '1'
      ) {
        deps.storage.setItem(RELOAD_FLAG, '1')
        deps.reload()
        // Never resolve: keep the Suspense fallback up while the page
        // reloads, avoiding a flash of the error UI.
        return new Promise<T>(() => {})
      }
      throw err
    }
  }
}

/**
 * Drop-in replacement for React.lazy that survives post-deploy stale
 * chunks. Use exactly like `lazy(() => import('./X').then(...))`.
 */
// Mirrors React.lazy's own signature (ComponentType<any>) so components
// with specific required props stay assignable — a stricter constraint
// like ComponentType<unknown> rejects them at the call site.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(createRetryingImport(factory))
}
