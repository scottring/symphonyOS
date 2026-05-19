import { describe, it, expect } from 'vitest'
import { greetingForHour } from './greeting'

describe('greetingForHour', () => {
  it('returns morning before noon', () => {
    expect(greetingForHour(0, 'Scott')).toBe('Good morning, Scott')
    expect(greetingForHour(11, 'Scott')).toBe('Good morning, Scott')
  })
  it('returns afternoon from noon to 17:59', () => {
    expect(greetingForHour(12, 'Scott')).toBe('Good afternoon, Scott')
    expect(greetingForHour(17, 'Scott')).toBe('Good afternoon, Scott')
  })
  it('returns evening from 18:00', () => {
    expect(greetingForHour(18, 'Scott')).toBe('Good evening, Scott')
    expect(greetingForHour(23, 'Scott')).toBe('Good evening, Scott')
  })
  it('uses only the first name token', () => {
    expect(greetingForHour(9, 'Scott Kaufman')).toBe('Good morning, Scott')
  })
  it('trims to a clean greeting when name is empty', () => {
    expect(greetingForHour(9, '')).toBe('Good morning')
  })
})
