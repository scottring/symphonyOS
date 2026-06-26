import { describe, it, expect } from 'vitest'
import { progressReward } from './progressReward'

describe('progressReward', () => {
  it('reports a clear (empty) day when nothing is actionable', () => {
    const r = progressReward(0, 0)
    expect(r.empty).toBe(true)
    expect(r.complete).toBe(false)
    expect(r.pct).toBe(0)
    expect(r.headline).toBe('Nothing scheduled')
  })

  it('celebrates when everything is done', () => {
    const r = progressReward(5, 5)
    expect(r.complete).toBe(true)
    expect(r.empty).toBe(false)
    expect(r.pct).toBe(100)
    expect(r.headline).toBe('All done')
    expect(r.detail).toContain('5')
  })

  it('uses singular copy when the one thing is done', () => {
    expect(progressReward(1, 1).detail).toBe('You cleared the one thing today.')
  })

  it('greets a fresh day with a consistent count', () => {
    const r = progressReward(0, 4)
    expect(r.headline).toBe('Here’s today')
    expect(r.detail).toBe('0 of 4 done')
    expect(r.pct).toBe(0)
  })

  it('escalates headline with momentum', () => {
    expect(progressReward(1, 5).headline).toBe('Just getting started') // 20%
    expect(progressReward(3, 6).headline).toBe('Building momentum')     // 50%
    expect(progressReward(5, 6).headline).toBe('Almost there')          // 83%
  })

  it('reports a consistent "X of Y done" detail throughout', () => {
    expect(progressReward(4, 6).detail).toBe('4 of 6 done')
    expect(progressReward(2, 6).detail).toBe('2 of 6 done')
  })

  it('clamps overshoot (more completed than actionable) to complete', () => {
    const r = progressReward(9, 5)
    expect(r.complete).toBe(true)
    expect(r.pct).toBe(100)
  })
})
