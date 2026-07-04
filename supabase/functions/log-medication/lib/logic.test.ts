import { describe, it, expect } from 'vitest'
import { matchMedication, parseBody } from './logic.ts'

const MEDS = [
  { id: '1', name: 'Carbidopa/Levodopa' },
  { id: '2', name: 'Rasagiline' },
]

describe('matchMedication', () => {
  it('"all" returns the all sentinel', () => {
    expect(matchMedication('all', MEDS)).toEqual({ kind: 'all' })
  })
  it('case-insensitive substring match returns the single med', () => {
    expect(matchMedication('levodopa', MEDS)).toEqual({ kind: 'one', med: MEDS[0] })
  })
  it('no match returns none', () => {
    expect(matchMedication('aspirin', MEDS)).toEqual({ kind: 'none' })
  })
  it('multiple matches returns ambiguous with candidates', () => {
    const meds = [{ id: '1', name: 'Levodopa AM' }, { id: '2', name: 'Levodopa PM' }]
    expect(matchMedication('levodopa', meds)).toEqual({ kind: 'ambiguous', candidates: meds })
  })
})

describe('parseBody', () => {
  it('rejects missing medication', () => {
    expect(parseBody({}).ok).toBe(false)
  })
  it('accepts a valid body and defaults source', () => {
    const r = parseBody({ medication: 'all', note: 'hi' })
    expect(r).toEqual({ ok: true, medication: 'all', taken_at: undefined, note: 'hi' })
  })
  it('rejects a non-ISO taken_at', () => {
    expect(parseBody({ medication: 'all', taken_at: 'not-a-date' }).ok).toBe(false)
  })
})
