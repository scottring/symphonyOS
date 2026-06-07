import { describe, it, expect } from 'vitest'
import { defaultScopeForArea } from './scope'

describe('defaultScopeForArea', () => {
  it('family -> compound (shared with the household)', () => {
    expect(defaultScopeForArea('family')).toBe('compound')
  })
  it('work -> individual (private)', () => {
    expect(defaultScopeForArea('work')).toBe('individual')
  })
  it('personal -> individual (private)', () => {
    expect(defaultScopeForArea('personal')).toBe('individual')
  })
  it('null/undefined (untagged) -> individual (private by default)', () => {
    expect(defaultScopeForArea(null)).toBe('individual')
    expect(defaultScopeForArea(undefined)).toBe('individual')
  })
})
