import { describe, it, expect } from 'vitest'
import { initialsFor } from './initials'

describe('initialsFor', () => {
  it('first + last initial, uppercased', () => {
    expect(initialsFor('Scott Kaufman')).toBe('SK')
  })
  it('single name → single initial', () => {
    expect(initialsFor('Scott')).toBe('S')
  })
  it('ignores extra middle tokens, uses first + last', () => {
    expect(initialsFor('Mary Jane Watson')).toBe('MW')
  })
  it('empty / whitespace → empty string', () => {
    expect(initialsFor('')).toBe('')
    expect(initialsFor('   ')).toBe('')
  })
})
