import { describe, it, expect } from 'vitest'
import { daySectionMeta } from '@/lib/daySectionMeta'
import { DAY_SECTION_BOUNDS } from '@/lib/timeUtils'

describe('daySectionMeta', () => {
  it('takes its range verbatim from the boundary table', () => {
    for (const bound of DAY_SECTION_BOUNDS) {
      expect(daySectionMeta(bound.section).range).toBe(bound.range)
      expect(daySectionMeta(bound.section).label).toBe(bound.label)
    }
  })

  it('gives the two untimed sections no range', () => {
    expect(daySectionMeta('allday').range).toBe('')
    expect(daySectionMeta('unscheduled').range).toBe('')
  })

  it('gives every section an icon', () => {
    for (const s of ['allday', 'earlyMorning', 'morning', 'afternoon', 'evening', 'night', 'unscheduled'] as const) {
      expect(daySectionMeta(s).Icon).toBeTruthy()
    }
  })
})
