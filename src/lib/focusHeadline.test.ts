import { describe, it, expect } from 'vitest'
import { focusHeadline } from './focusHeadline'

describe('focusHeadline', () => {
  it('returns a calm headline for healthy states', () => {
    expect(focusHeadline('excellent')).toBe('Keep today simple and connected.')
    expect(focusHeadline('good')).toBe('Keep today simple and connected.')
  })
  it('returns a focusing headline when clarity needs attention', () => {
    expect(focusHeadline('needsAttention')).toBe('A few things need your attention today.')
    expect(focusHeadline('fair')).toBe('A few things need your attention today.')
  })
  it('falls back to the calm headline for unknown state', () => {
    expect(focusHeadline('whatever' as never)).toBe('Keep today simple and connected.')
  })
})
