import { describe, it, expect } from 'vitest'
import { guidedPeriod, plannablePeriod, nextGuidedPeriod, daysRemainingIn, resolveGuidedTarget } from './periods'

describe('guidedPeriod', () => {
  const now = new Date(2026, 6, 9) // Thu Jul 9 2026

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

  it('weekly follows the cadence week start (default Sunday) and the weekToken format', () => {
    const p = guidedPeriod('weekly', now)
    // Default cadence config: weekStartsOn 0 → anchor Sun Jul 5.
    expect(p.start.getDay()).toBe(0)
    expect(p.start.getDate()).toBe(5)
    expect(p.token).toBe('2026-7-5') // weekToken(anchor) — byte-matches the nudge token
    expect(p.label).toBe('Week of July 5')
    expect(p.end.getDay()).toBe(6) // Saturday 23:59
  })

  it('daily token is ISO date', () => {
    const p = guidedPeriod('daily', now)
    expect(p.token).toBe('2026-07-09')
    expect(p.label).toBe('Thursday, July 9')
  })
})

describe('daysRemainingIn', () => {
  it('counts today: last day of a week = 1, first day = 7', () => {
    const sun = new Date(2026, 6, 19) // Sun Jul 19, week Jul 19–25
    expect(daysRemainingIn(guidedPeriod('weekly', sun), sun)).toBe(7)
    const sat = new Date(2026, 6, 25)
    expect(daysRemainingIn(guidedPeriod('weekly', sat), sat)).toBe(1)
  })

  it('handles the seasonal exclusive end', () => {
    const aug31 = new Date(2026, 7, 31) // last day of Summer (ends Sep 1 exclusive)
    expect(daysRemainingIn(guidedPeriod('seasonal', aug31), aug31)).toBe(1)
  })
})

describe('plannablePeriod (the threshold rule)', () => {
  it('weekly: Sunday (day 1, Sunday start) plans the week that starts today', () => {
    const sun = new Date(2026, 6, 19)
    const { period, mode } = plannablePeriod('weekly', sun)
    expect(mode).toBe('fresh')
    expect(period.token).toBe('2026-7-19')
  })

  it('weekly: Wednesday is midstream on the current week', () => {
    const wed = new Date(2026, 6, 22)
    const { period, mode } = plannablePeriod('weekly', wed)
    expect(mode).toBe('midstream')
    expect(period.token).toBe('2026-7-19')
  })

  it('weekly: Thursday onward (≤3 days left) plans next week', () => {
    for (const day of [23, 24, 25]) { // Thu, Fri, Sat
      const { period, mode } = plannablePeriod('weekly', new Date(2026, 6, day))
      expect(mode, `Jul ${day}`).toBe('next')
      expect(period.token, `Jul ${day}`).toBe('2026-7-26')
    }
  })

  it('monthly: mid-month is midstream, last week flips to next month', () => {
    const mid = plannablePeriod('monthly', new Date(2026, 6, 19))
    expect(mid.mode).toBe('midstream')
    expect(mid.period.token).toBe('2026-7')
    const late = plannablePeriod('monthly', new Date(2026, 6, 27)) // 5 days left
    expect(late.mode).toBe('next')
    expect(late.period.token).toBe('2026-8')
    const first = plannablePeriod('monthly', new Date(2026, 7, 1))
    expect(first.mode).toBe('fresh')
  })

  it('monthly: December rolls into January of the next year', () => {
    const { period } = plannablePeriod('monthly', new Date(2026, 11, 28))
    expect(period.token).toBe('2027-1')
  })

  it('seasonal: last 3 weeks flip to the next season', () => {
    const mid = plannablePeriod('seasonal', new Date(2026, 6, 19))
    expect(mid.mode).toBe('midstream')
    expect(mid.period.token).toBe('2026-S2')
    const late = plannablePeriod('seasonal', new Date(2026, 7, 20)) // Aug 20 — 13 days left
    expect(late.mode).toBe('next')
    expect(late.period.token).toBe('2026-S3')
  })

  it('annual: Nov 1 onward plans next year', () => {
    expect(plannablePeriod('annual', new Date(2026, 9, 31)).period.token).toBe('2026')
    const nov = plannablePeriod('annual', new Date(2026, 10, 1))
    expect(nov.mode).toBe('next')
    expect(nov.period.token).toBe('2027')
  })

  it('daily always plans today', () => {
    const { period, mode } = plannablePeriod('daily', new Date(2026, 6, 19, 23, 0))
    expect(mode).toBe('fresh')
    expect(period.token).toBe('2026-07-19')
  })
})

describe('nextGuidedPeriod', () => {
  it('season wraps December into the following winter token', () => {
    const p = nextGuidedPeriod('seasonal', new Date(2026, 10, 15)) // Fall → Winter (starts Dec 1)
    expect(p.token).toBe('2026-S0')
    expect(p.start.getMonth()).toBe(11)
  })
})

describe('resolveGuidedTarget', () => {
  const thu = new Date(2026, 6, 23) // auto → next week

  it('auto late in the week targets next week and offers the current week back', () => {
    const t = resolveGuidedTarget('weekly', 'auto', thu)
    expect(t.mode).toBe('next')
    expect(t.period.token).toBe('2026-7-26')
    expect(t.alt).toEqual({ target: 'current', label: 'Week of July 19' })
  })

  it('pinning current late in the week is midstream with a next escape', () => {
    const t = resolveGuidedTarget('weekly', 'current', thu)
    expect(t.mode).toBe('midstream')
    expect(t.period.token).toBe('2026-7-19')
    expect(t.alt?.target).toBe('next')
  })

  it('a fresh period start offers no toggle', () => {
    const t = resolveGuidedTarget('monthly', 'auto', new Date(2026, 7, 1))
    expect(t.mode).toBe('fresh')
    expect(t.alt).toBeNull()
  })

  it('daily never toggles', () => {
    expect(resolveGuidedTarget('daily', 'auto', thu).alt).toBeNull()
  })
})
