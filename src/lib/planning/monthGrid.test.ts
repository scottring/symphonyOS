import { describe, it, expect } from 'vitest'
import { monthGridWeeks } from './monthGrid'
import { localYmd } from '@/lib/cadence/config'

// Final review (2026-11-04): the Month calendar listed a fixed five weeks, so
// a six-row month lost its last days.
describe('monthGridWeeks', () => {
  it('has as many rows as the month needs, and the last one holds the month’s last day', () => {
    // August 2026 starts on a Saturday: a Sunday-start grid needs six rows.
    const aug = monthGridWeeks(new Date(2026, 7, 1), 0)
    expect(aug).toHaveLength(6)
    expect(aug[5].map(localYmd)).toContain('2026-08-31')
    // November 2026 starts on a Sunday: five rows.
    expect(monthGridWeeks(new Date(2026, 10, 1), 0)).toHaveLength(5)
    // February 2026 starts on a Sunday and has 28 days: four rows.
    expect(monthGridWeeks(new Date(2026, 1, 1), 0)).toHaveLength(4)
    // A Monday-start week: November 2026 needs six.
    expect(monthGridWeeks(new Date(2026, 10, 1), 1)).toHaveLength(6)
  })
})
