import { describe, it, expect, vi } from 'vitest'
import {
  proposeGroceries, toggleGroceryLine, linesToAdd, linesToRetry, markSaving, applyGroceryResults,
  saveGroceryLines, normalizeGroceryText, grocerySummary, type GroceryIO,
} from './groceryProposal'

/** An in-memory grocery list that can be told to fail particular inserts. */
function fakeList(initial: string[] = [], failOnce: string[] = [], commitThenFail: string[] = []) {
  const open = [...initial]
  const fails = new Set(failOnce)
  const ghost = new Set(commitThenFail)
  const io: GroceryIO = {
    fetchOpenTexts: vi.fn(async () => [...open]),
    insertLine: vi.fn(async (text: string) => {
      if (fails.has(text)) { fails.delete(text); return false }
      open.push(text)
      // The row committed but the response was lost: the client sees a failure.
      if (ghost.has(text)) { ghost.delete(text); return false }
      return true
    }),
  }
  return { open, io }
}

describe('grocery proposal', () => {
  it('normalizes text so spacing, case and punctuation do not make duplicates', () => {
    expect(normalizeGroceryText('  2 Lb  Ground turkey. ')).toBe('2 lb ground turkey')
    expect(normalizeGroceryText('1.5 cups rice')).toBe('1.5 cups rice')
  })

  it('collapses duplicate lines and toggles will-add ⇄ skip', () => {
    let p = proposeGroceries(['Onion', 'onion', 'Cumin'], 'dinner')
    expect(p.lines.map((l) => l.text)).toEqual(['Onion', 'Cumin'])
    expect(linesToAdd(p)).toHaveLength(2)
    p = toggleGroceryLine(p, p.lines[0].key)
    expect(p.lines[0].state).toBe('skip')
    expect(linesToAdd(p).map((l) => l.text)).toEqual(['Cumin'])
    expect(proposeGroceries(['A'], 'cooking', false).lines[0].state).toBe('skip')
  })

  it('a saving or added line does not toggle', () => {
    let p = proposeGroceries(['A'], 'dinner')
    p = markSaving(p, [p.lines[0].key])
    expect(toggleGroceryLine(p, p.lines[0].key).lines[0].state).toBe('saving')
  })

  it('skips lines already on the list (no insert), inserts the rest one by one', async () => {
    const { io, open } = fakeList(['Cumin '])
    const p = proposeGroceries(['cumin', 'Onion'], 'dinner')
    const results = await saveGroceryLines(linesToAdd(p), io)
    expect(results).toEqual([
      { key: p.lines[0].key, ok: true, alreadyListed: true },
      { key: p.lines[1].key, ok: true },
    ])
    expect(io.insertLine).toHaveBeenCalledTimes(1)
    expect(open).toEqual(['Cumin ', 'Onion'])
  })

  it('retries ONLY the failed lines, and never duplicates', async () => {
    const { io, open } = fakeList([], ['Onion'])
    let p = proposeGroceries(['Onion', 'Cumin', 'Beans'], 'dinner')
    p = applyGroceryResults(p, await saveGroceryLines(linesToAdd(p), io))
    expect(grocerySummary(p)).toMatchObject({ added: 2, failed: 1 })
    expect(linesToAdd(p)).toHaveLength(0) // a failed line waits for Retry
    expect(linesToRetry(p).map((l) => l.text)).toEqual(['Onion'])

    vi.mocked(io.insertLine).mockClear()
    p = applyGroceryResults(p, await saveGroceryLines(linesToRetry(p), io))
    expect(io.insertLine).toHaveBeenCalledTimes(1)
    expect(io.insertLine).toHaveBeenCalledWith('Onion', 0)
    expect(grocerySummary(p)).toMatchObject({ added: 3, failed: 0 })
    expect(open.sort()).toEqual(['Beans', 'Cumin', 'Onion'])
  })

  it('a retry after a lost response finds the committed row instead of inserting twice', async () => {
    const { io, open } = fakeList([], [], ['Onion'])
    let p = proposeGroceries(['Onion'], 'dinner')
    p = applyGroceryResults(p, await saveGroceryLines(linesToAdd(p), io))
    expect(p.lines[0].state).toBe('failed')
    p = applyGroceryResults(p, await saveGroceryLines(linesToRetry(p), io))
    expect(p.lines[0]).toMatchObject({ state: 'added', alreadyListed: true })
    expect(open).toEqual(['Onion'])
  })

  it('when the list cannot be read, nothing is inserted and every line fails', async () => {
    const io: GroceryIO = { fetchOpenTexts: vi.fn(async () => { throw new Error('offline') }), insertLine: vi.fn(async () => true) }
    const p = proposeGroceries(['A', 'B'], 'dinner')
    const results = await saveGroceryLines(linesToAdd(p), io)
    expect(results.every((r) => !r.ok)).toBe(true)
    expect(io.insertLine).not.toHaveBeenCalled()
  })
})
