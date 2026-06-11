import { describe, it, expect } from 'vitest'
import { normalizeScheduledFor } from './scheduledFor'

describe('normalizeScheduledFor', () => {
  it('converts a date-only string to local midnight ISO (not UTC midnight)', () => {
    const result = normalizeScheduledFor('2026-06-22') as string
    const parsed = new Date(result)
    // Round-trips to the same local calendar day at midnight local time
    expect(parsed.getFullYear()).toBe(2026)
    expect(parsed.getMonth()).toBe(5)
    expect(parsed.getDate()).toBe(22)
    expect(parsed.getHours()).toBe(0)
    expect(parsed.getMinutes()).toBe(0)
    // Regression: the raw-string behavior stored UTC midnight, which is the
    // previous evening in US timezones. Local-midnight ISO differs from the
    // bare "00:00:00Z" form whenever the machine is west of UTC.
    if (new Date().getTimezoneOffset() > 0) {
      expect(result).not.toBe('2026-06-22T00:00:00.000Z')
    }
  })

  it('passes through full ISO strings untouched', () => {
    expect(normalizeScheduledFor('2026-06-22T14:30:00-04:00')).toBe('2026-06-22T14:30:00-04:00')
    expect(normalizeScheduledFor('2026-06-22T04:00:00.000Z')).toBe('2026-06-22T04:00:00.000Z')
  })

  it('passes through null/undefined/empty/non-string values', () => {
    expect(normalizeScheduledFor(null)).toBeNull()
    expect(normalizeScheduledFor(undefined)).toBeUndefined()
    expect(normalizeScheduledFor('')).toBe('')
    expect(normalizeScheduledFor(42)).toBe(42)
  })
})
