import { describe, it, expect } from 'vitest'
import { filterSince } from './dedupe'
import type { ParsedMessage } from './whatsapp'

const m = (timestamp: string, text: string): ParsedMessage => ({ timestamp, sender: 'X', text })

describe('filterSince', () => {
  it('returns all messages and the newest timestamp when no checkpoint', () => {
    const msgs = [m('2026-05-30T09:00:00', 'a'), m('2026-05-30T10:00:00', 'b')]
    expect(filterSince(msgs, null)).toEqual({ fresh: msgs, newestIso: '2026-05-30T10:00:00' })
  })

  it('drops messages at or before the checkpoint', () => {
    const msgs = [m('2026-05-30T09:00:00', 'a'), m('2026-05-30T10:00:00', 'b'), m('2026-05-30T11:00:00', 'c')]
    const r = filterSince(msgs, '2026-05-30T10:00:00')
    expect(r.fresh.map((x) => x.text)).toEqual(['c'])
    expect(r.newestIso).toBe('2026-05-30T11:00:00')
  })

  it('returns empty fresh and preserves checkpoint when nothing is new', () => {
    const msgs = [m('2026-05-30T09:00:00', 'a')]
    expect(filterSince(msgs, '2026-05-30T12:00:00')).toEqual({ fresh: [], newestIso: '2026-05-30T12:00:00' })
  })
})
