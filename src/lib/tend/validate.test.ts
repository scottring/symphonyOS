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
    ] }, IDS, {})
    expect(out).toHaveLength(4)
    expect(out.map((p) => p.id)).toEqual(['ai-0', 'ai-1', 'ai-2', 'ai-3'])
  })

  it('drops proposals referencing unknown task ids', () => {
    const out = parseTendProposals({ proposals: [
      { kind: 'put_aside', taskId: 'nope', why: '' },
      { kind: 'merge', keepId: 't1', dropIds: ['ghost'], why: '' },
      { kind: 'place', taskIds: ['t1', 'ghost'], date: '2026-07-25', why: '' },
    ] }, IDS, {})
    expect(out).toHaveLength(0)
  })

  it('drops malformed dates/times/kinds and non-object entries', () => {
    const out = parseTendProposals({ proposals: [
      { kind: 'place', taskIds: ['t1'], date: '07/25/2026', why: '' },
      { kind: 'place', taskIds: ['t1'], date: '2026-07-25', time: 'ten', why: '' },
      { kind: 'explode', taskId: 't1', why: '' },
      'not-an-object',
      { kind: 'regrade', taskId: 't1', to: 'year', why: '' },
    ] }, IDS, {})
    expect(out).toHaveLength(0)
  })

  it('clamps why to 200 chars, caps at 12 proposals, tolerates non-object input', () => {
    const many = Array.from({ length: 20 }, () => ({ kind: 'put_aside', taskId: 't1', why: 'x'.repeat(500) }))
    const out = parseTendProposals({ proposals: many }, IDS, {})
    expect(out).toHaveLength(12)
    expect((out[0].why ?? '').length).toBeLessThanOrEqual(200)
    expect(parseTendProposals(null, IDS, {})).toEqual([])
    expect(parseTendProposals({ proposals: 'nope' }, IDS, {})).toEqual([])
  })

  describe('dateWindow', () => {
    const WINDOW = { minYmd: '2026-07-20', maxYmd: '2026-07-26' }

    it('accepts a place proposal whose date is inside the window', () => {
      const out = parseTendProposals({ proposals: [
        { kind: 'place', taskIds: ['t1'], date: '2026-07-23', why: '' },
      ] }, IDS, { dateWindow: WINDOW })
      expect(out).toHaveLength(1)
    })

    it('drops a place proposal whose date is before the window minimum', () => {
      const out = parseTendProposals({ proposals: [
        { kind: 'place', taskIds: ['t1'], date: '2026-07-19', why: '' },
      ] }, IDS, { dateWindow: WINDOW })
      expect(out).toHaveLength(0)
    })

    it('drops a place proposal whose date is after the window maximum', () => {
      const out = parseTendProposals({ proposals: [
        { kind: 'place', taskIds: ['t1'], date: '2026-07-27', why: '' },
      ] }, IDS, { dateWindow: WINDOW })
      expect(out).toHaveLength(0)
    })

    it('with no window provided, keeps the old unbounded behavior', () => {
      const out = parseTendProposals({ proposals: [
        { kind: 'place', taskIds: ['t1'], date: '2099-01-01', why: '' },
      ] }, IDS, {})
      expect(out).toHaveLength(1)
    })
  })

  it('drops regrades outside allowedRegrades and accepts those inside', () => {
    const out = parseTendProposals({ proposals: [
      { kind: 'regrade', taskId: 't1', to: 'week', why: '' },
      { kind: 'regrade', taskId: 't2', to: 'month', why: '' },
      { kind: 'regrade', taskId: 't3', to: 'season', why: '' },
    ] }, IDS, { allowedRegrades: new Set(['week', 'season', 'someday']) })
    expect(out.map((p) => (p as { to: string }).to)).toEqual(['week', 'season'])
  })

  it('accepts season regrade when no allowedRegrades given', () => {
    const out = parseTendProposals({ proposals: [
      { kind: 'regrade', taskId: 't1', to: 'season', why: '' },
    ] }, IDS, {})
    expect(out).toHaveLength(1)
  })
})
