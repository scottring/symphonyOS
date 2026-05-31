import { describe, it, expect } from 'vitest'
import { chunkMessages } from './chunk'
import type { ParsedMessage } from './whatsapp'
const m = (t: string, text: string): ParsedMessage => ({ timestamp: t, sender: 'A', text })

describe('chunkMessages', () => {
  it('returns one chunk when under the budget', () => {
    const out = chunkMessages([m('2026-05-30T09:00:00', 'hi'), m('2026-05-30T09:01:00', 'yo')], 10000)
    expect(out).toHaveLength(1)
    expect(out[0]).toContain('hi')
    expect(out[0]).toContain('yo')
  })
  it('splits into multiple chunks when over the budget', () => {
    const msgs = Array.from({ length: 10 }, (_, i) => m('2026-05-30T09:00:00', 'x'.repeat(50)))
    const out = chunkMessages(msgs, 120)
    expect(out.length).toBeGreaterThan(1)
    out.forEach((c) => expect(c.length).toBeLessThanOrEqual(200))
  })
  it('emits a single oversized message as its own chunk', () => {
    const out = chunkMessages([m('2026-05-30T09:00:00', 'z'.repeat(500))], 100)
    expect(out).toHaveLength(1)
  })
  it('returns empty array for no messages', () => {
    expect(chunkMessages([], 100)).toEqual([])
  })
})
