import { describe, it, expect } from 'vitest'
import { pickFitsGoal, coherenceHint, goalsInFocusNudge } from './pickCoherence'

describe('pickFitsGoal', () => {
  it('true when pick shares meaningful words with its goal', () => {
    expect(pickFitsGoal('Living room + entryway set up', 'Every room set up for how we live')).toBe(true)
  })
  it('false when a pick is topically unrelated to its goal', () => {
    expect(pickFitsGoal('Weed the backyard', 'A budget & investment plan')).toBe(false)
  })
})

describe('coherenceHint', () => {
  it('returns null when the pick fits', () => {
    expect(coherenceHint('Set up the living room', 'Every room set up for how we live')).toBeNull()
  })
  it('returns a re-parent hint when it does not fit', () => {
    expect(coherenceHint('Weed the backyard', 'A budget & investment plan')).toMatch(/re-parent/i)
  })
})

describe('goalsInFocusNudge', () => {
  it('null at or below threshold', () => {
    expect(goalsInFocusNudge(['a', 'b', 'c'], 6)).toBeNull()
  })
  it('nudges above threshold', () => {
    expect(goalsInFocusNudge(['a','b','c','d','e','f','g'], 6)).toMatch(/next season/i)
  })
})
