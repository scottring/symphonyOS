import { describe, it, expect, beforeEach, vi } from 'vitest'
import { expansionKey, readExpanded, writeExpanded } from './goalExpansion'

describe('remembered expansion', () => {
  beforeEach(() => localStorage.clear())

  it('survives a round trip, which is the whole point', () => {
    const key = expansionKey('month', '2026-10-01')
    writeExpanded(key, new Set(['g1', 'g2']))
    expect([...readExpanded(key)].sort()).toEqual(['g1', 'g2'])
  })

  it('keeps each period separate', () => {
    writeExpanded(expansionKey('month', '2026-10-01'), new Set(['oct']))
    expect(readExpanded(expansionKey('month', '2026-11-01')).size).toBe(0)
    expect(readExpanded(expansionKey('season', '2026-10-01')).size).toBe(0)
  })

  it('forgets nothing and invents nothing when the store is empty or broken', () => {
    expect(readExpanded(expansionKey('month', '2026-10-01')).size).toBe(0)
    localStorage.setItem(expansionKey('month', '2026-10-01'), 'not json')
    expect(readExpanded(expansionKey('month', '2026-10-01')).size).toBe(0)
    localStorage.setItem(expansionKey('month', '2026-10-01'), '{"a":1}')
    expect(readExpanded(expansionKey('month', '2026-10-01')).size).toBe(0)
  })

  it('clears the entry rather than storing an empty list', () => {
    const key = expansionKey('month', '2026-10-01')
    writeExpanded(key, new Set(['g1']))
    writeExpanded(key, new Set())
    expect(localStorage.getItem(key)).toBeNull()
  })

  it('renders on, silently, when storage throws', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    expect(readExpanded('k').size).toBe(0)
    expect(() => writeExpanded('k', new Set(['a']))).not.toThrow()
    get.mockRestore(); set.mockRestore()
  })
})
