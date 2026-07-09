import { describe, it, expect } from 'vitest'
import { guidedPeriod } from './periods'

describe('guidedPeriod', () => {
  const now = new Date(2026, 6, 9) // Jul 9 2026

  it('annual token matches existing rows', () => {
    const p = guidedPeriod('annual', now)
    expect(p.token).toBe('2026')
    expect(p.label).toBe('2026')
    expect(p.start.getMonth()).toBe(0)
    expect(p.end.getMonth()).toBe(11)
  })

  it('seasonal token matches existing rows (Summer = S2)', () => {
    const p = guidedPeriod('seasonal', now)
    expect(p.token).toBe('2026-S2')
    expect(p.label).toBe('Summer 2026')
  })

  it('monthly token matches existing rows (no zero-pad)', () => {
    const p = guidedPeriod('monthly', now)
    expect(p.token).toBe('2026-7')
    expect(p.label).toBe('July 2026')
  })

  it('weekly token matches the existing weekly session format', () => {
    const p = guidedPeriod('weekly', now)
    // Pin to the EXACT format found in Step 1 (adjust this assertion to match).
    expect(p.token).toMatch(/^2026-W\d{2}$/)
    expect(p.start.getDay()).toBe(1) // Monday start, matching weeklyPlanning.ts
  })

  it('daily token is ISO date', () => {
    const p = guidedPeriod('daily', now)
    expect(p.token).toBe('2026-07-09')
    expect(p.label).toBe('Thursday, July 9')
  })
})
