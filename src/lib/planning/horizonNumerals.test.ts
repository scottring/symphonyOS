import { describe, it, expect } from 'vitest'
import { horizonNumerals, railEntries, weekOfYear } from './horizonNumerals'
import { readSeasons } from '@/lib/cadence/seasons'

describe('horizonNumerals', () => {
  it('names each horizon by its own date', () => {
    const n = horizonNumerals(new Date(2026, 8, 28), readSeasons(), 0)
    expect(n.year.n).toBe('2026')
    expect(n.month).toEqual({ n: '09', label: 'September' })
    expect(n.today).toEqual({ n: '28', label: 'Today' })
    expect(n.season.n).toMatch(/^\d\d–\d\d$/)
  })
  it('counts weeks in the household’s own weeks', () => {
    expect(weekOfYear(new Date(2026, 0, 1), 0)).toBe(1)
    expect(weekOfYear(new Date(2026, 8, 28), 0)).toBe(40)
    expect(weekOfYear(new Date(2026, 8, 17), 1)).toBe(38)
  })
})

// Beta walkthrough 2026-09-29: Fall (Oct–Dec) on screen, rail still said
// September and Summer because it read the clock.
describe('railEntries — the rail follows the period on screen', () => {
  const custom = [
    { name: 'Winter', month: 1, day: 1 }, { name: 'Spring', month: 4, day: 1 },
    { name: 'Summer', month: 7, day: 1 }, { name: 'Fall', month: 10, day: 1 },
  ] as unknown as Parameters<typeof railEntries>[2]
  const now = new Date(2026, 8, 29) // Tue Sep 29

  it('on Fall’s page: October, week 40, and links to those dates; Today stays today', () => {
    const r = railEntries(now, { period: 'season', start: new Date(2026, 9, 1) }, custom, 6)
    expect(r.season).toMatchObject({ label: 'Fall', to: '/season?start=2026-10-01' })
    expect(r.month).toMatchObject({ n: '10', label: 'October', to: '/month?start=2026-10-01' })
    expect(r.week.to).toBe('/week?start=2026-09-26')
    expect(r.today).toMatchObject({ n: '29', to: '/today' })
  })

  it('a week is placed by its middle day', () => {
    const r = railEntries(now, { period: 'week', start: new Date(2026, 9, 3) }, custom, 6)
    expect(r.month.label).toBe('October')
    expect(r.season.label).toBe('Fall')
    expect(r.week.to).toBe('/week?start=2026-10-03')
  })

  it('off a plan page it reads the clock, with plain links', () => {
    const r = railEntries(now, null, custom, 6)
    expect(r.month).toMatchObject({ label: 'September', to: '/month' })
    expect(r.season.label).toBe('Summer')
  })

  // Scott, 2026-09-29: Year 2026 read "Winter · January · week 1", and a
  // Fall page starting Sep 1 read "week 36".
  it('a period that holds today reads from today', () => {
    const y = railEntries(now, { period: 'year', start: new Date(2026, 0, 1) }, custom, 6)
    expect(y.month.label).toBe('September')
    expect(y.season.label).toBe('Summer')
    expect(y.week.n).toBe('40')
    const other = railEntries(now, { period: 'year', start: new Date(2027, 0, 1) }, custom, 6)
    expect(other.month.label).toBe('January')
  })
})

describe('railEntries — while a guided run is on, the rail names what it plans', () => {
  const custom = [
    { name: 'Winter', month: 1, day: 1 }, { name: 'Spring', month: 4, day: 1 },
    { name: 'Summer', month: 7, day: 1 }, { name: 'Fall', month: 10, day: 1 },
  ] as unknown as Parameters<typeof railEntries>[2]
  const now = new Date(2026, 8, 30) // Wed Sep 30, inside week 40 (Sat Sep 26 – Fri Oct 2)
  const run = { year: new Date(2026, 0, 1), season: new Date(2026, 9, 1), month: new Date(2026, 9, 1), week: new Date(2026, 8, 26) }

  it('on week 40 (which holds today): October and Fall, not September and Summer (walkthrough 2026-09-30)', () => {
    const r = railEntries(now, { period: 'week', start: new Date(2026, 8, 26) }, custom, 6, run)
    expect(r.month).toMatchObject({ label: 'October', to: '/month?start=2026-10-01' })
    expect(r.season).toMatchObject({ label: 'Fall', to: '/season?start=2026-10-01' })
    expect(r.week).toMatchObject({ n: '40', to: '/week?start=2026-09-26' })
  })

  it('the level on screen stays the page’s own', () => {
    const r = railEntries(now, { period: 'month', start: new Date(2026, 8, 1) }, custom, 6, run)
    expect(r.month.label).toBe('September')
    expect(r.season.label).toBe('Fall')
  })

  it('without a run, the rail reads the clock as before', () => {
    const r = railEntries(now, { period: 'week', start: new Date(2026, 8, 26) }, custom, 6)
    expect(r.month.label).toBe('September')
    expect(r.season.label).toBe('Summer')
  })
})
