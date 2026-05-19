import { describe, it, expect } from 'vitest'
import { computeAnchorTime } from './timelineAnchor'

const d = (h: number, m: number) => { const x = new Date(2026, 4, 18); x.setHours(h, m, 0, 0); return x }

describe('computeAnchorTime', () => {
  it('returns 5-min-snapped midpoint between two timed items', () => {
    const r = computeAnchorTime({ before: d(18, 0), after: d(18, 30), section: 'evening', date: new Date(2026, 4, 18) })
    expect(r?.getHours()).toBe(18)
    expect(r?.getMinutes()).toBe(15)
  })
  it('snaps a non-round midpoint to nearest 5 min', () => {
    const r = computeAnchorTime({ before: d(9, 0), after: d(9, 7), section: 'morning', date: new Date(2026, 4, 18) })
    expect(r?.getMinutes()).toBe(5) // midpoint 9:03:30 → snap 9:05
  })
  it('section head with a following item → one minute before it', () => {
    const r = computeAnchorTime({ before: null, after: d(9, 0), section: 'morning', date: new Date(2026, 4, 18) })
    expect(r?.getHours()).toBe(8); expect(r?.getMinutes()).toBe(59)
  })
  it('section tail with a preceding item → one minute after it', () => {
    const r = computeAnchorTime({ before: d(21, 0), after: null, section: 'evening', date: new Date(2026, 4, 18) })
    expect(r?.getHours()).toBe(21); expect(r?.getMinutes()).toBe(1)
  })
  it('allday section → null (no time, date only)', () => {
    expect(computeAnchorTime({ before: null, after: null, section: 'allday', date: new Date(2026, 4, 18) })).toBeNull()
  })
  it('unscheduled section → null', () => {
    expect(computeAnchorTime({ before: null, after: null, section: 'unscheduled', date: new Date(2026, 4, 18) })).toBeNull()
  })
})
