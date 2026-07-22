import { describe, it, expect } from 'vitest'
import { parseTendProposals } from './validate'

const IDS = new Set(['t1', 't2', 't3'])

describe('parseTendProposals', () => {
  it('accepts well-formed proposals of every kind and stamps ai- ids', () => {
    const out = parseTendProposals({ proposals: [
      { kind: 'merge', keepId: 't1', dropIds: ['t2'], why: 'same task' },
      { kind: 'put_aside', taskId: 't3', why: 'stale' },
      { kind: 'regrade', taskId: 't1', to: 'month', why: 'month-sized' },
      { kind: 'place', taskIds: ['t2'], date: '2026-07-25', time: '10:00', why: 'open morning' },
    ] }, IDS)
    expect(out).toHaveLength(4)
    expect(out.map((p) => p.id)).toEqual(['ai-0', 'ai-1', 'ai-2', 'ai-3'])
  })

  it('drops proposals referencing unknown task ids', () => {
    const out = parseTendProposals({ proposals: [
      { kind: 'put_aside', taskId: 'nope', why: '' },
      { kind: 'merge', keepId: 't1', dropIds: ['ghost'], why: '' },
      { kind: 'place', taskIds: ['t1', 'ghost'], date: '2026-07-25', why: '' },
    ] }, IDS)
    expect(out).toHaveLength(0)
  })

  it('drops malformed dates/times/kinds and non-object entries', () => {
    const out = parseTendProposals({ proposals: [
      { kind: 'place', taskIds: ['t1'], date: '07/25/2026', why: '' },
      { kind: 'place', taskIds: ['t1'], date: '2026-07-25', time: 'ten', why: '' },
      { kind: 'explode', taskId: 't1', why: '' },
      'not-an-object',
      { kind: 'regrade', taskId: 't1', to: 'year', why: '' },
    ] }, IDS)
    expect(out).toHaveLength(0)
  })

  it('clamps why to 200 chars, caps at 12 proposals, tolerates non-object input', () => {
    const many = Array.from({ length: 20 }, () => ({ kind: 'put_aside', taskId: 't1', why: 'x'.repeat(500) }))
    const out = parseTendProposals({ proposals: many }, IDS)
    expect(out).toHaveLength(12)
    expect((out[0].why ?? '').length).toBeLessThanOrEqual(200)
    expect(parseTendProposals(null, IDS)).toEqual([])
    expect(parseTendProposals({ proposals: 'nope' }, IDS)).toEqual([])
  })
})
