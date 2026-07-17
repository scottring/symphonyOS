import { describe, it, expect } from 'vitest'
import { looksVague } from './goalQuality'

describe('looksVague', () => {
  it('flags a present-tense goal with no number and few words', () => {
    expect(looksVague('Make home into home')).toBe(true)
    expect(looksVague('Learn Spanish')).toBe(true)
    expect(looksVague('Get healthy')).toBe(true)
  })

  it('does not flag a past-tense outcome (has a finish-line verb)', () => {
    expect(looksVague('Shipped the beta to customers')).toBe(false)
    expect(looksVague('Renovated the kitchen')).toBe(false)
    expect(looksVague('Ran a marathon')).toBe(false) // irregular past
    expect(looksVague('Wrote the book')).toBe(false)
  })

  it('does not flag a goal with a number (implies a finish line)', () => {
    expect(looksVague('Lose 20 pounds')).toBe(false)
    expect(looksVague('Save $10k')).toBe(false)
    expect(looksVague('Q3 launch done')).toBe(false)
  })

  it('does not flag a thoughtfully-written longer goal (length cap)', () => {
    expect(
      looksVague('Be the kind of parent who is present and patient every single evening'),
    ).toBe(false)
  })

  it('treats empty / whitespace input as not vague (no hint on nothing)', () => {
    expect(looksVague('')).toBe(false)
    expect(looksVague('   ')).toBe(false)
  })
})
