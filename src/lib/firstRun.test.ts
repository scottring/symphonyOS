import { describe, it, expect } from 'vitest'
import { needsFirstRun } from './firstRun'

describe('needsFirstRun', () => {
  it('is true for a fresh account', () => {
    expect(needsFirstRun({ completed: false, hasTasks: false, memberCount: 0 })).toBe(true)
    expect(needsFirstRun({ completed: false, hasTasks: false, memberCount: 1 })).toBe(true)
  })
  it('is false once the profile is stamped', () => {
    expect(needsFirstRun({ completed: true, hasTasks: false, memberCount: 0 })).toBe(false)
  })
  it('is false for an account that already has tasks (legacy users)', () => {
    expect(needsFirstRun({ completed: false, hasTasks: true, memberCount: 1 })).toBe(false)
  })
  it('is false for someone who joined an existing household', () => {
    expect(needsFirstRun({ completed: false, hasTasks: false, memberCount: 3 })).toBe(false)
  })
})
