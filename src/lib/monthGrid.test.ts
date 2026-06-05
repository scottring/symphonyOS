import { describe, it, expect } from 'vitest'
import { buildMonthGrid } from './monthGrid'

describe('buildMonthGrid', () => {
  it('returns whole weeks starting Sunday and ending Saturday', () => {
    const grid = buildMonthGrid(2026, 5) // June 2026
    expect(grid.length % 7).toBe(0)
    expect(grid[0].date.getDay()).toBe(0) // Sunday
    expect(grid[grid.length - 1].date.getDay()).toBe(6) // Saturday
  })

  it('pads with the trailing days of the previous month', () => {
    const grid = buildMonthGrid(2026, 5) // June 2026 — June 1 is a Monday
    // First cell is Sunday May 31, 2026, flagged out-of-month
    expect(grid[0].date.getFullYear()).toBe(2026)
    expect(grid[0].date.getMonth()).toBe(4) // May
    expect(grid[0].date.getDate()).toBe(31)
    expect(grid[0].inMonth).toBe(false)
  })

  it('includes every day of the target month flagged in-month', () => {
    const grid = buildMonthGrid(2026, 5)
    const june = grid.filter((c) => c.inMonth)
    expect(june).toHaveLength(30)
    expect(june[0].date.getDate()).toBe(1)
    expect(june[29].date.getDate()).toBe(30)
    expect(june.every((c) => c.date.getMonth() === 5)).toBe(true)
  })

  it('pads with the leading days of the next month', () => {
    const grid = buildMonthGrid(2026, 5) // ends Tue June 30 -> trailing Jul 1-4
    const last = grid[grid.length - 1]
    expect(last.date.getMonth()).toBe(6) // July
    expect(last.date.getDate()).toBe(4)
    expect(last.inMonth).toBe(false)
  })

  it('handles a month that begins on Sunday with no leading pad', () => {
    // March 2026 begins on a Sunday
    const grid = buildMonthGrid(2026, 2)
    expect(grid[0].date.getMonth()).toBe(2)
    expect(grid[0].date.getDate()).toBe(1)
    expect(grid[0].inMonth).toBe(true)
  })
})
