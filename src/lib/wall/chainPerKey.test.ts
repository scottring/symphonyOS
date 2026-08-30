import { describe, it, expect } from 'vitest'
import { chainPerKey } from './chainPerKey'

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

describe('chainPerKey', () => {
  it('runs same-key calls one at a time, in call order', async () => {
    const map = new Map<string, Promise<unknown>>()
    const order: string[] = []
    const gate = deferred<void>()

    const p1 = chainPerKey(map, 'a', async () => {
      order.push('start-1')
      await gate.promise
      order.push('end-1')
    })
    const p2 = chainPerKey(map, 'a', async () => {
      order.push('start-2')
      order.push('end-2')
    })

    // Flush one microtask turn: p1's body should have started, p2's must not
    // have — it's queued behind p1's still-pending promise.
    await Promise.resolve()
    expect(order).toEqual(['start-1'])

    gate.resolve()
    await p1
    await p2
    expect(order).toEqual(['start-1', 'end-1', 'start-2', 'end-2'])
  })

  it('runs different keys independently', async () => {
    const map = new Map<string, Promise<unknown>>()
    const order: string[] = []
    const gate = deferred<void>()

    const p1 = chainPerKey(map, 'a', async () => {
      order.push('start-a')
      await gate.promise
      order.push('end-a')
    })
    const p2 = chainPerKey(map, 'b', async () => {
      order.push('start-b')
      order.push('end-b')
    })

    await p2
    expect(order).toEqual(['start-a', 'start-b', 'end-b'])

    gate.resolve()
    await p1
    expect(order).toEqual(['start-a', 'start-b', 'end-b', 'end-a'])
  })

  it('a rejected run does not stall the next call for the same key', async () => {
    const map = new Map<string, Promise<unknown>>()
    const p1 = chainPerKey(map, 'a', () => Promise.reject(new Error('boom')))
    await expect(p1).rejects.toThrow('boom')

    const p2 = chainPerKey(map, 'a', () => Promise.resolve('ok'))
    await expect(p2).resolves.toBe('ok')
  })

  it("propagates the call's own result to its caller", async () => {
    const map = new Map<string, Promise<unknown>>()
    const value = await chainPerKey(map, 'k', () => Promise.resolve(42))
    expect(value).toBe(42)
  })

  it('the second of two rapid same-key writes reads state written by the first (no lost update)', async () => {
    // Models the writeProgress race: `state` is the "row" in the DB, read at
    // the START of each run. Without chaining, both reads see base=0 and the
    // second write clobbers the first (`applyProgressDelta`-style +5 twice
    // should land on 10, not 5).
    const map = new Map<string, Promise<unknown>>()
    let state = 0

    async function readModifyWrite(delta: number) {
      const base = state // "read"
      await Promise.resolve() // yield, so a concurrent call could interleave
      state = base + delta // "write"
    }

    await Promise.all([
      chainPerKey(map, 'entity-1', () => readModifyWrite(5)),
      chainPerKey(map, 'entity-1', () => readModifyWrite(5)),
    ])

    expect(state).toBe(10)
  })
})
