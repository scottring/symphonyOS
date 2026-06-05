import { describe, it, expect } from 'vitest'
import { pickAccountEmail } from './CalendarSettings'

describe('pickAccountEmail', () => {
  it('returns the primary calendar email', () => {
    const calendars = [
      { email: 'shared@group.calendar.google.com', primary: false },
      { email: 'smkaufman@gmail.com', primary: true },
    ]
    expect(pickAccountEmail(calendars)).toBe('smkaufman@gmail.com')
  })

  it('falls back to the first calendar when none is flagged primary', () => {
    const calendars = [
      { email: 'first@gmail.com' },
      { email: 'second@gmail.com' },
    ]
    expect(pickAccountEmail(calendars)).toBe('first@gmail.com')
  })

  it('returns null for an empty list', () => {
    expect(pickAccountEmail([])).toBeNull()
  })

  it('returns null when the chosen calendar has no email', () => {
    expect(pickAccountEmail([{ primary: true }])).toBeNull()
  })
})
