import { describe, it, expect } from 'vitest'
import { isWideStep, stepColumnClassName } from './stepLayout'

describe('isWideStep', () => {
  it('marks the grid-rendering steps wide', () => {
    expect(isWideStep('calendar')).toBe(true)
    expect(isWideStep('schedule-grid')).toBe(true)
    expect(isWideStep('place-on-weeks')).toBe(true)
  })
  it('leaves prose steps at reading measure', () => {
    expect(isWideStep('intro')).toBe(false)
    expect(isWideStep('reflect')).toBe(false)
  })
})

describe('stepColumnClassName', () => {
  // The bug this pins, found by walking the season wizard on 2026-08-05: the
  // waypoint rail is absolute at left-7 (md+), and "The season ahead" rendered
  // its heading and prose straight through the step dots.
  it('pads a wide step clear of the waypoint rail', () => {
    const wide = stepColumnClassName(true)
    expect(wide).toContain('max-w-none')
    expect(wide).toContain('md:pl-20')
  })

  // A narrow step's clearance comes from centring a 680px column, not padding —
  // so it must keep both, or it drifts into the gutter the same way.
  it('keeps a narrow step centred at reading measure', () => {
    const narrow = stepColumnClassName(false)
    expect(narrow).toContain('max-w-[680px]')
    expect(narrow).toContain('mx-auto')
    expect(narrow).not.toContain('max-w-none')
  })
})
