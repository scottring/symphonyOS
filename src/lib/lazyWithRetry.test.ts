import { describe, it, expect, vi } from 'vitest'
import { createRetryingImport, isChunkLoadError } from './lazyWithRetry'

function fakeStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  }
}

describe('isChunkLoadError', () => {
  it('matches the production stale-deploy signatures', () => {
    expect(
      isChunkLoadError(
        new TypeError(
          "Failed to fetch dynamically imported module: https://app.symphony-os.com/assets/NotesPage-old.js"
        )
      )
    ).toBe(true)
    expect(
      isChunkLoadError(
        new TypeError(
          "Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of \"text/html\"."
        )
      )
    ).toBe(true)
    expect(isChunkLoadError(new Error('Loading chunk 42 failed.'))).toBe(true)
  })

  it('does not match unrelated runtime errors by message alone', () => {
    // isChunkLoadError is purely message-based; the empty-module TypeError is
    // recovered by createRetryingImport's instanceof check, not by this matcher.
    expect(
      isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'x')"))
    ).toBe(false)
  })
})

describe('createRetryingImport', () => {
  it('returns the module and clears the reload guard on success', async () => {
    const storage = fakeStorage()
    storage.setItem('symphony:chunk-reload', '1')
    const reload = vi.fn()
    const mod = { default: 'X' }

    const run = createRetryingImport(async () => mod, { reload, storage })
    await expect(run()).resolves.toBe(mod)

    expect(reload).not.toHaveBeenCalled()
    expect(storage.getItem('symphony:chunk-reload')).toBeNull()
  })

  it('reloads once on a recognized chunk-load rejection and sets the guard', async () => {
    const storage = fakeStorage()
    const reload = vi.fn()
    const run = createRetryingImport(
      async () => {
        throw new TypeError('Failed to fetch dynamically imported module: x.js')
      },
      { reload, storage }
    )

    // Never resolves (Suspense stays up while reloading) — assert side effects.
    run()
    await Promise.resolve()

    expect(reload).toHaveBeenCalledTimes(1)
    expect(storage.getItem('symphony:chunk-reload')).toBe('1')
  })

  it('reloads once when a stale chunk resolves to an empty module (TypeError reading the export off undefined)', async () => {
    // The exact production failure: the host serves index.html (text/html) for
    // a now-missing hashed chunk, the import resolves empty, and the factory's
    // `m.ProjectsListRedesign` throws this TypeError. It must trigger recovery,
    // not dead-end at the error boundary.
    const storage = fakeStorage()
    const reload = vi.fn()
    const run = createRetryingImport(
      async () => {
        throw new TypeError("Cannot read properties of undefined (reading 'ProjectsListRedesign')")
      },
      { reload, storage }
    )

    run()
    await Promise.resolve()

    expect(reload).toHaveBeenCalledTimes(1)
    expect(storage.getItem('symphony:chunk-reload')).toBe('1')
  })

  it('also recovers from the Safari phrasing of an empty-module access', async () => {
    const storage = fakeStorage()
    const reload = vi.fn()
    const run = createRetryingImport(
      async () => {
        throw new TypeError("undefined is not an object (evaluating 'm.ProjectsListRedesign')")
      },
      { reload, storage }
    )

    run()
    await Promise.resolve()

    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('does NOT reload twice — rethrows if the guard is already set', async () => {
    const storage = fakeStorage()
    storage.setItem('symphony:chunk-reload', '1')
    const reload = vi.fn()
    const run = createRetryingImport(
      async () => {
        throw new TypeError("Cannot read properties of undefined (reading 'X')")
      },
      { reload, storage }
    )

    await expect(run()).rejects.toThrow(TypeError)
    expect(reload).not.toHaveBeenCalled()
  })

  it('rethrows genuine non-chunk errors (non-TypeError) without reloading', async () => {
    // A real top-level evaluation error in a module surfaces as a thrown Error
    // (not a TypeError from an empty namespace) and must NOT trigger a reload.
    const storage = fakeStorage()
    const reload = vi.fn()
    const run = createRetryingImport(
      async () => {
        throw new Error('deliberate module-eval failure')
      },
      { reload, storage }
    )

    await expect(run()).rejects.toThrow(/deliberate module-eval failure/)
    expect(reload).not.toHaveBeenCalled()
  })
})
