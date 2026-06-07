import { describe, it, expect } from 'vitest'
import { weekStartAnchor, weekToken, getDueSession, DEFAULT_CADENCE } from './config'

describe('cadence config', () => {
  describe('weekStartAnchor', () => {
    it('Sunday start: Wed 2026-06-10 anchors to Sun 2026-06-07', () => {
      const wed = new Date(2026, 5, 10, 14, 0, 0)
      const anchor = weekStartAnchor(wed, 0)
      expect(anchor.getFullYear()).toBe(2026)
      expect(anchor.getMonth()).toBe(5)
      expect(anchor.getDate()).toBe(7) // Sunday
      expect(anchor.getHours()).toBe(0)
    })
    it('Monday start: Wed 2026-06-10 anchors to Mon 2026-06-08', () => {
      const wed = new Date(2026, 5, 10, 14, 0, 0)
      const anchor = weekStartAnchor(wed, 1)
      expect(anchor.getDate()).toBe(8) // Monday
    })
    it('on the start day itself, anchor is that day', () => {
      const sun = new Date(2026, 5, 7, 9, 0, 0)
      expect(weekStartAnchor(sun, 0).getDate()).toBe(7)
    })
  })

  describe('weekToken', () => {
    it('is stable within a week and changes across weeks', () => {
      const mon = new Date(2026, 5, 8)
      const sat = new Date(2026, 5, 13)
      const nextMon = new Date(2026, 5, 15)
      expect(weekToken(mon, 0)).toBe(weekToken(sat, 0))
      expect(weekToken(mon, 0)).not.toBe(weekToken(nextMon, 0))
    })
  })

  describe('getDueSession', () => {
    it('weekly nudge fires on the configured day (Sunday default)', () => {
      const sun = new Date(2026, 5, 7) // Sunday
      const due = getDueSession(DEFAULT_CADENCE, sun)
      expect(due?.kind).toBe('week')
    })
    it('no nudge on a non-nudge day', () => {
      const wed = new Date(2026, 5, 10)
      expect(getDueSession(DEFAULT_CADENCE, wed)).toBeNull()
    })
    it('moving the nudge day to Monday shifts when it fires', () => {
      const cfg = { ...DEFAULT_CADENCE, weekStartsOn: 1 as const, weeklyNudgeDay: 1 }
      expect(getDueSession(cfg, new Date(2026, 5, 7))).toBeNull()  // Sunday: not due
      expect(getDueSession(cfg, new Date(2026, 5, 8))?.kind).toBe('week') // Monday: due
    })
    it('disabled weekly nudge never fires', () => {
      const cfg = { ...DEFAULT_CADENCE, weeklyNudgeEnabled: false }
      expect(getDueSession(cfg, new Date(2026, 5, 7))).toBeNull()
    })
  })
})
