import { describe, it, expect } from 'vitest'
import { isoWeekId } from './weeklyPlanning'

describe('isoWeekId', () => {
  it('formats an ISO week as YYYY-Www', () => {
    expect(isoWeekId(new Date('2026-05-22T12:00:00'))).toMatch(/^2026-W\d{2}$/)
  })
  it('pads single-digit weeks', () => {
    expect(isoWeekId(new Date('2026-01-05T12:00:00'))).toBe('2026-W02')
  })
})
