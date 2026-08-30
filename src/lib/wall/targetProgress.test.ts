import { describe, it, expect } from 'vitest'
import { applyProgressDelta, applyProgressExact } from './targetProgress'

const NOW = new Date('2026-08-30T15:00:00')

describe('applyProgressDelta', () => {
  it('adds to null progress from zero', () => {
    const p = applyProgressDelta(null, 10, 20, NOW)
    expect(p).toEqual({ progress: 10, status: 'pending', completed_at: null })
  })
  it('accumulates sessions and completes at target', () => {
    const p = applyProgressDelta(12, 10, 20, NOW)
    expect(p.progress).toBe(22)
    expect(p.status).toBe('completed')
    expect(p.completed_at).toBe(NOW.toISOString())
  })
  it('completes exactly at target', () => {
    expect(applyProgressDelta(15, 5, 20, NOW).status).toBe('completed')
  })
  it('never goes below zero', () => {
    expect(applyProgressDelta(3, -10, 20, NOW).progress).toBe(0)
  })
  it('with no target it only accumulates, never completes', () => {
    const p = applyProgressDelta(5, 5, null, NOW)
    expect(p).toEqual({ progress: 10, status: 'pending', completed_at: null })
  })
})

describe('applyProgressExact', () => {
  it('sets an exact value below target back to pending', () => {
    expect(applyProgressExact(8, 20, NOW)).toEqual({ progress: 8, status: 'pending', completed_at: null })
  })
  it('sets an exact value at/over target to completed', () => {
    const p = applyProgressExact(25, 20, NOW)
    expect(p.status).toBe('completed')
    expect(p.completed_at).toBe(NOW.toISOString())
  })
  it('zero resets to pending', () => {
    expect(applyProgressExact(0, 20, NOW)).toEqual({ progress: 0, status: 'pending', completed_at: null })
  })
  it('clamps negatives to zero', () => {
    expect(applyProgressExact(-5, 20, NOW).progress).toBe(0)
  })
})
