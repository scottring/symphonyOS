import { describe, it, expect } from 'vitest'
import { springStep, springSettled, releaseTarget, type SpringState } from '@/lib/fold/foldSpring'

describe('foldSpring', () => {
  it('settles toward 1 within 90 steps with a small overshoot', () => {
    let s: SpringState = { p: 0, v: 0 }
    let max = 0
    let n = 0
    while (!springSettled(s, 1) && n < 90) {
      s = springStep(s, 1, 1 / 60)
      max = Math.max(max, s.p)
      n++
    }
    expect(springSettled(s, 1)).toBe(true)
    expect(max).toBeGreaterThan(1.005)
    expect(max).toBeLessThan(1.04)
  })
  it('caps dt at 0.032', () => {
    expect(springStep({ p: 0, v: 0 }, 1, 5)).toEqual(springStep({ p: 0, v: 0 }, 1, 0.032))
  })
  it('releaseTarget uses projected position', () => {
    expect(releaseTarget(0.45, 1)).toBe(1)
    expect(releaseTarget(0.6, -2)).toBe(0)
  })
})
