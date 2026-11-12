import { describe, expect, it } from 'vitest'
import { dayTableLine } from './dayTable'

describe('dayTableLine', () => {
  it('names every day of the next two weeks, so "Friday" is never worked out by hand (school email, 2026-11-12)', () => {
    const line = dayTableLine('2026-11-12')
    expect(line).toContain('Thu 2026-11-12 (today)')
    expect(line).toContain('Fri 2026-11-13')
    expect(line).toContain('Fri 2026-11-20')
    expect(line).toContain('Sat 2026-11-21')
    expect(line).toContain('Wed 2026-11-25')
    expect(line).not.toContain('2026-11-26')
  })

  it('crosses a month and a year end, and a DST change, without slipping a day', () => {
    expect(dayTableLine('2026-12-28')).toContain('Fri 2027-01-01')
    expect(dayTableLine('2026-10-30')).toContain('Sun 2026-11-01')
    expect(dayTableLine('2026-10-30')).toContain('Mon 2026-11-02')
  })

  it('says nothing for a date that is not real', () => {
    expect(dayTableLine('2026-02-30')).toBe('')
    expect(dayTableLine('soon')).toBe('')
  })
})
