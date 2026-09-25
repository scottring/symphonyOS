import { describe, it, expect } from 'vitest'
import { weeksOfMonth } from './monthWeeks'

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

describe('weeksOfMonth', () => {
  it('lists October 2026 as the five weeks Scott needed to choose from', () => {
    const weeks = weeksOfMonth(new Date(2026, 9, 1), 0)
    expect(weeks.map((w) => w.label)).toEqual([
      'Sep 27 – Oct 3', 'Oct 4 – 10', 'Oct 11 – 17', 'Oct 18 – 24', 'Oct 25 – 31',
    ])
    // The starts are exactly what week_start stores.
    expect(weeks.map((w) => ymd(w.start))).toEqual([
      '2026-09-27', '2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25',
    ])
  })

  it('keeps the week that straddles the boundary — the 1st is plannable too', () => {
    // Oct 1 2026 is a Thursday, inside the week beginning Sun Sep 27. Dropping
    // that week would make the first three days of October unreachable.
    expect(weeksOfMonth(new Date(2026, 9, 15), 0)[0].label).toBe('Sep 27 – Oct 3')
  })

  it('honours a Monday-start household', () => {
    const weeks = weeksOfMonth(new Date(2026, 9, 1), 1)
    expect(ymd(weeks[0].start)).toBe('2026-09-28')
    expect(weeks[0].label).toBe('Sep 28 – Oct 4')
  })

  it('works from any day in the month, not just the 1st', () => {
    expect(weeksOfMonth(new Date(2026, 9, 31), 0)).toEqual(weeksOfMonth(new Date(2026, 9, 1), 0))
  })

  it('handles a month that begins exactly on the week start', () => {
    // Nov 1 2026 is a Sunday.
    const weeks = weeksOfMonth(new Date(2026, 10, 1), 0)
    expect(weeks[0].label).toBe('Nov 1 – 7')
    expect(weeks).toHaveLength(5)
  })
})
