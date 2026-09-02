import { describe, it, expect } from 'vitest'
import { zonedIso, addDays, isYmd } from './dates'

describe('zonedIso', () => {
  it('midnight New York in March (EST) is 05:00Z', () => {
    expect(zonedIso('2026-03-05', null, 'America/New_York')).toBe('2026-03-05T05:00:00.000Z')
  })
  it('midnight New York in September (EDT) is 04:00Z', () => {
    expect(zonedIso('2026-09-02', null, 'America/New_York')).toBe('2026-09-02T04:00:00.000Z')
  })
  it('a timed event keeps its wall time', () => {
    expect(zonedIso('2026-09-10', '15:30', 'America/New_York')).toBe('2026-09-10T19:30:00.000Z')
  })
  it('works west of the date line', () => {
    expect(zonedIso('2026-09-02', null, 'Pacific/Auckland')).toBe('2026-09-01T12:00:00.000Z')
  })
})

describe('addDays', () => {
  it('crosses a month boundary', () => { expect(addDays('2026-09-30', 1)).toBe('2026-10-01') })
  it('goes backwards', () => { expect(addDays('2026-03-01', -1)).toBe('2026-02-28') })
})

describe('isYmd', () => {
  it('accepts YYYY-MM-DD only', () => {
    expect(isYmd('2026-09-02')).toBe(true)
    expect(isYmd('2026-9-2')).toBe(false)
    expect(isYmd('Thursday')).toBe(false)
    expect(isYmd(undefined)).toBe(false)
  })
})
