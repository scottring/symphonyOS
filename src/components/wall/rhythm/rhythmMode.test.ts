import { describe, it, expect } from 'vitest'
import { rhythmModeForClock, RHYTHM_MODES, type RhythmMode } from './rhythmMode'

describe('rhythmModeForClock', () => {
  const at = (h: number, m = 0) => { const d = new Date(); d.setHours(h, m, 0, 0); return d }

  it('returns "morning" for 6:00–8:59', () => {
    expect(rhythmModeForClock(at(6, 0))).toBe('morning')
    expect(rhythmModeForClock(at(8, 59))).toBe('morning')
  })

  it('returns "day" for 9:00–14:59', () => {
    expect(rhythmModeForClock(at(9, 0))).toBe('day')
    expect(rhythmModeForClock(at(14, 59))).toBe('day')
  })

  it('returns "after-school" for 15:00–16:59', () => {
    expect(rhythmModeForClock(at(15, 0))).toBe('after-school')
    expect(rhythmModeForClock(at(16, 59))).toBe('after-school')
  })

  it('returns "dinner" for 17:00–18:59', () => {
    expect(rhythmModeForClock(at(17, 0))).toBe('dinner')
    expect(rhythmModeForClock(at(18, 59))).toBe('dinner')
  })

  it('returns "bedtime" for 19:00–20:59', () => {
    expect(rhythmModeForClock(at(19, 0))).toBe('bedtime')
    expect(rhythmModeForClock(at(20, 59))).toBe('bedtime')
  })

  it('returns "wind-down" for 21:00 through 5:59', () => {
    expect(rhythmModeForClock(at(21, 0))).toBe('wind-down')
    expect(rhythmModeForClock(at(23, 59))).toBe('wind-down')
    expect(rhythmModeForClock(at(0, 0))).toBe('wind-down')
    expect(rhythmModeForClock(at(5, 59))).toBe('wind-down')
  })

  it('RHYTHM_MODES has 6 entries in display order', () => {
    expect(RHYTHM_MODES).toEqual<RhythmMode[]>(['morning', 'day', 'after-school', 'dinner', 'bedtime', 'wind-down'])
  })
})
