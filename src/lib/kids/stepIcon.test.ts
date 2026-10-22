import { describe, expect, it } from 'vitest'
import { stepIcon } from './stepIcon'

describe('stepIcon', () => {
  it('the shower-night steps each get their own picture', () => {
    expect([
      'Shower', 'Dry off the bathroom floor', 'Dirty clothes in the hamper', 'Hang up your wet towel',
      'Pull-up on', 'Get dressed', 'Wait quietly for Mommy to read',
    ].map(stepIcon)).toEqual(['shower', 'floor', 'hamper', 'towel', 'pullup', 'dressed', 'read'])
  })

  it('the more specific word wins', () => {
    expect(stepIcon('Pull-up off, underwear on')).toBe('pullup')
    expect(stepIcon('Pull-up in the downstairs trash')).toBe('trash')
    expect(stepIcon('Feed Jax dinner')).toBe('pet')
    expect(stepIcon('Make bed and straighten room')).toBe('bed')
    expect(stepIcon('Tidy bedrooms')).toBe('tidy')
  })

  it('whole words only', () => {
    expect(stepIcon('Pack for vacation')).toBe('bag')
    expect(stepIcon('Repeat after me')).toBe('step')
  })
})
