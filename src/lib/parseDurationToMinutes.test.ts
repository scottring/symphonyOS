import { describe, it, expect } from 'vitest'
import { parseDurationToMinutes } from './parseDurationToMinutes'

describe('parseDurationToMinutes', () => {
  it('returns null for empty / invalid input', () => {
    expect(parseDurationToMinutes('')).toBeNull()
    expect(parseDurationToMinutes('not-a-duration')).toBeNull()
    expect(parseDurationToMinutes(undefined as unknown as string)).toBeNull()
  })

  it('parses minutes-only durations', () => {
    expect(parseDurationToMinutes('PT30M')).toBe(30)
    expect(parseDurationToMinutes('PT5M')).toBe(5)
  })

  it('parses hours-only durations', () => {
    expect(parseDurationToMinutes('PT1H')).toBe(60)
    expect(parseDurationToMinutes('PT2H')).toBe(120)
  })

  it('parses combined hours + minutes', () => {
    expect(parseDurationToMinutes('PT1H30M')).toBe(90)
    expect(parseDurationToMinutes('PT2H15M')).toBe(135)
  })

  it('handles bare numeric strings as minutes', () => {
    expect(parseDurationToMinutes('45')).toBe(45)
    expect(parseDurationToMinutes('90')).toBe(90)
  })
})
