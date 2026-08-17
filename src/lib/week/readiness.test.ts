import { describe, it, expect } from 'vitest'
import { hasExecutionContext } from './readiness'

describe('hasExecutionContext', () => {
  it('is false for a bare title', () => {
    expect(hasExecutionContext({})).toBe(false)
    expect(hasExecutionContext({ notes: '   ', links: [], phoneNumber: '', location: '' })).toBe(false)
  })

  it('is true with any one piece of context', () => {
    expect(hasExecutionContext({ notes: 'ask about the retainer' })).toBe(true)
    expect(hasExecutionContext({ links: [{ url: 'https://x.com', title: 'portal' }] })).toBe(true)
    expect(hasExecutionContext({ phoneNumber: '410-555-0100' })).toBe(true)
    expect(hasExecutionContext({ location: '123 Main St' })).toBe(true)
  })
})
