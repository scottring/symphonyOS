import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LOCK_WAIT_MS, patientLock } from './authLock'

// A small LockManager: one exclusive holder, a queue, abort signals and steal.
function fakeLocks() {
  let held: { release: () => void } | null = null
  const queue: (() => void)[] = []
  const request = (name: string, opts: { signal?: AbortSignal; steal?: boolean }, cb: (lock: { name: string }) => Promise<unknown>) =>
    new Promise((resolve, reject) => {
      const run = () => {
        let release!: () => void
        const done = new Promise<void>((r) => { release = r })
        held = { release }
        Promise.resolve(cb({ name })).then(resolve, reject).finally(() => { release(); if (held?.release === release) { held = null; queue.shift()?.() } })
        return done
      }
      if (opts.steal || !held) { void run(); return }
      const go = () => { void run() }
      queue.push(go)
      opts.signal?.addEventListener('abort', () => {
        const i = queue.indexOf(go)
        if (i >= 0) queue.splice(i, 1)
        reject(new DOMException('aborted', 'AbortError'))
      })
    })
  return { request, holdForever: () => { held = { release: () => {} } } }
}

let locks: ReturnType<typeof fakeLocks>
beforeEach(() => {
  vi.useFakeTimers()
  locks = fakeLocks()
  vi.stubGlobal('navigator', { locks: { request: locks.request } })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('the sign-in lock', () => {
  it('runs at once when nobody holds it', async () => {
    await expect(patientLock('auth', -1, async () => 'ok')).resolves.toBe('ok')
  })

  it('takes over from a tab that never lets go, after the wait', async () => {
    locks.holdForever()
    const fn = vi.fn(async () => 'mine')
    const p = patientLock('auth', -1, fn)
    await vi.advanceTimersByTimeAsync(LOCK_WAIT_MS - 1)
    expect(fn).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await expect(p).resolves.toBe('mine')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('passes the work’s own error back, without running it twice', async () => {
    const fn = vi.fn(async () => { throw new DOMException('fetch aborted', 'AbortError') })
    await expect(patientLock('auth', -1, fn)).rejects.toThrow('fetch aborted')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('runs without a lock where the browser has none', async () => {
    vi.stubGlobal('navigator', {})
    await expect(patientLock('auth', -1, async () => 'ok')).resolves.toBe('ok')
  })
})
